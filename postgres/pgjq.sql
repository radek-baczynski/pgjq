------------------------------------------------------------
-- Schema, tables, records, privileges, indexes, etc
------------------------------------------------------------
-- When installed as an extension, we don't need to create the `pgjq` schema
-- because it is automatically created by postgres due to being declared in
-- the extension control file
DO
$$
BEGIN
    IF (SELECT NOT EXISTS( SELECT 1 FROM pg_extension WHERE extname = 'pgjq')) THEN
      CREATE SCHEMA IF NOT EXISTS pgjq;
    END IF;
END
$$;

-- Table where queues and metadata about them is stored
CREATE TABLE pgjq.meta (
    queue_name VARCHAR UNIQUE NOT NULL,
    is_partitioned BOOLEAN NOT NULL,
    is_unlogged BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Grant permission to pg_monitor to all tables and sequences
GRANT USAGE ON SCHEMA pgjq TO pg_monitor;
GRANT SELECT ON ALL TABLES IN SCHEMA pgjq TO pg_monitor;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA pgjq TO pg_monitor;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgjq GRANT SELECT ON TABLES TO pg_monitor;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgjq GRANT SELECT ON SEQUENCES TO pg_monitor;

-- Create job status enum type
CREATE TYPE pgjq.job_status AS ENUM (
    'pending',    -- Initial state when job is created
    'active',     -- job is being processed (after read/poll)
    'completed',  -- job has been successfully processed (after archive)
    'failed',     -- job processing failed
    'cancelled',  -- job was cancelled before completion
    'stale'       -- job processing took too long
);

-- This type has the shape of a job in a queue, and is often returned by
-- pgjq functions that return jobs
CREATE TYPE pgjq.job_record AS (
    job_id VARCHAR(10),
    read_ct INTEGER,
    enqueued_at TIMESTAMP,
    dequeued_at TIMESTAMP,
    staled_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    failed_at TIMESTAMP,
    job JSONB,
    headers JSONB,
    status pgjq.job_status,
    stale_after INTERVAL,
    priority INTEGER
);

CREATE TYPE pgjq.queue_record AS (
    queue_name VARCHAR,
    is_partitioned BOOLEAN,
    is_unlogged BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE
);

-- Create job operation log table
CREATE TABLE pgjq.job_log (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(10) NOT NULL,
    queue_name VARCHAR NOT NULL,
    operation VARCHAR NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create index on job_log for faster lookups
CREATE INDEX job_log_job_id_idx ON pgjq.job_log(job_id);
CREATE INDEX job_log_queue_name_idx ON pgjq.job_log(queue_name);

------------------------------------------------------------
-- Functions
------------------------------------------------------------

-- Function to log job operations
CREATE FUNCTION pgjq.log_job_operation(
    job_id VARCHAR(10),
    queue_name TEXT,
    operation VARCHAR
)
RETURNS void AS $$
BEGIN
    INSERT INTO pgjq.job_log (job_id, queue_name, operation, logged_at)
    VALUES (job_id, queue_name, operation, now());
END;
$$ LANGUAGE plpgsql;

-- a helper to format table names and check for invalid characters
CREATE FUNCTION pgjq.format_table_name(queue_name text, prefix text)
RETURNS TEXT AS $$
BEGIN
    IF queue_name ~ '\$|;|--|'''
    THEN
        RAISE EXCEPTION 'queue name contains invalid characters: $, ;, --, or';
    END IF;
    RETURN lower(prefix || '_' || queue_name);
END;
$$ LANGUAGE plpgsql;

-- Function to generate random ID
CREATE OR REPLACE FUNCTION pgjq.generate_random_id()
RETURNS VARCHAR(10) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(10) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..10 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

---- delete
---- deletes a job id from the queue permanently
CREATE FUNCTION pgjq.delete_queue(
    queue_name TEXT,
    job_id VARCHAR(10)
)
RETURNS BOOLEAN AS $$
DECLARE
    sql TEXT;
    result VARCHAR(10);
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
BEGIN
    sql := FORMAT(
        $QUERY$
        DELETE FROM pgjq.%I
        WHERE job_id = $1
        RETURNING job_id
        $QUERY$,
        qtable
    );
    EXECUTE sql USING job_id INTO result;
    
    IF result IS NOT NULL THEN
        PERFORM pgjq.log_job_operation(job_id, queue_name, 'delete');
    END IF;
    
    RETURN NOT (result IS NULL);
END;
$$ LANGUAGE plpgsql;

---- jobs chart

CREATE TYPE pgjq.chart_record AS (
    datetime TIMESTAMP,
    operation VARCHAR,
    count INTEGER
);

CREATE FUNCTION pgjq.jobs_chart(
    queue_name TEXT,
    from_time TIMESTAMP DEFAULT now() - interval '1 hour',
    to_time TIMESTAMP DEFAULT now(), 
    group_interval INTERVAL DEFAULT '1 minute'
)
RETURNS SETOF pgjq.chart_record AS $$
DECLARE
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
    queue_name_param ALIAS FOR queue_name;
BEGIN
    RETURN QUERY
    WITH time_series AS (
        SELECT generate_series(
            date_trunc('minute', from_time),
            date_trunc('minute', to_time),
            group_interval
        ) AS datetime
    ),
    operations AS (
        SELECT DISTINCT operation
        FROM pgjq.job_log jl
        WHERE jl.queue_name = queue_name_param
        AND jl.logged_at BETWEEN from_time AND to_time
    ),
    time_operation_series AS (
        SELECT 
            t.datetime,
            o.operation
        FROM time_series t
        CROSS JOIN operations o
    ),
    operation_counts AS (
        SELECT 
            date_trunc('minute', logged_at) AS datetime,
            operation,
            COUNT(*) AS count
        FROM pgjq.job_log jl
        WHERE jl.queue_name = queue_name_param
        AND logged_at BETWEEN from_time AND to_time
        GROUP BY date_trunc('minute', logged_at), operation
    )
    SELECT 
        tos.datetime,
        tos.operation,
        COALESCE(oc.count, 0)::INTEGER AS count
    FROM time_operation_series tos
    LEFT JOIN operation_counts oc ON tos.datetime = oc.datetime AND tos.operation = oc.operation
    ORDER BY tos.datetime, tos.operation;
END;
$$ LANGUAGE plpgsql;


-- send: actual implementation
CREATE FUNCTION pgjq.enqueue(
    queue_name TEXT,
    job JSONB,
    stale_after INTERVAL DEFAULT '1 minute',
    priority INTEGER DEFAULT 0
) RETURNS SETOF VARCHAR(10) AS $$
DECLARE
    sql TEXT;
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
    result VARCHAR(10);
    job_id VARCHAR(10);
BEGIN
    IF priority < 0 THEN
        RAISE EXCEPTION 'priority must be >= 0';
    END IF;

    -- Generate ID outside the INSERT to reduce lock contention
    job_id := pgjq.generate_random_id();

    sql := FORMAT(
            $QUERY$
        INSERT INTO pgjq.%I (job_id, job, stale_after, priority)
        VALUES ($1, $2, $3, $4)
        RETURNING job_id;
        $QUERY$,
            qtable
           );
    EXECUTE sql USING job_id, job, stale_after, priority INTO result;
    
    -- Log the enqueue operation
    PERFORM pgjq.log_job_operation(result, queue_name, 'enqueue');
    
    RETURN NEXT result;
    RETURN;
END;
$$ LANGUAGE plpgsql;


-- returned by pgjq.metrics() and pgjq.metrics_all
CREATE TYPE pgjq.metrics_result AS (
    queue_name text,
    queue_length bigint,
    newest_job_age_sec int,
    oldest_job_age_sec int,
    total_jobs bigint,
    scrape_time timestamp with time zone,
    queue_visible_length bigint,
    pending_count bigint,
    failed_count bigint,
    staled_count bigint,
    completed_count bigint,
    cancelled_count bigint,
    active_count bigint
);

-- get metrics for a single queue
CREATE FUNCTION pgjq.metrics(queue_name TEXT)
RETURNS pgjq.metrics_result AS $$
DECLARE
    result_row pgjq.metrics_result;
    query TEXT;
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
BEGIN
    query := FORMAT(
        $QUERY$
        WITH q_summary AS (
            SELECT
                count(*) as queue_length,
                count(CASE WHEN status = 'pending' THEN 1 END) as queue_visible_length,
                EXTRACT(epoch FROM (NOW() - max(enqueued_at)))::int as newest_job_age_sec,
                EXTRACT(epoch FROM (NOW() - min(enqueued_at)))::int as oldest_job_age_sec,
                NOW() as scrape_time,
                count(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                count(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
                count(CASE WHEN status = 'stale' THEN 1 END) as staled_count,
                count(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
                count(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
                count(CASE WHEN status = 'active' THEN 1 END) as active_count
            FROM pgjq.%I
        ),
        all_metrics AS (
            SELECT count(*) as total_jobs
            FROM pgjq.%I
        )
        SELECT
            %L as queue_name,
            q_summary.queue_length,
            q_summary.newest_job_age_sec,
            q_summary.oldest_job_age_sec,
            all_metrics.total_jobs,
            q_summary.scrape_time,
            q_summary.queue_visible_length,
            q_summary.pending_count,
            q_summary.failed_count,
            q_summary.staled_count,
            q_summary.completed_count,
            q_summary.cancelled_count,
            q_summary.active_count
        FROM q_summary, all_metrics
        $QUERY$,
        qtable, qtable, queue_name
    );
    EXECUTE query INTO result_row;
    RETURN result_row;
END;
$$ LANGUAGE plpgsql;

-- get metrics for all queues
CREATE FUNCTION pgjq."metrics_all"()
RETURNS SETOF pgjq.metrics_result AS $$
DECLARE
    row_name RECORD;
    result_row pgjq.metrics_result;
    queue_names TEXT[];
    i INTEGER;
BEGIN
    -- Get all queue names at once to avoid cursor issues
    SELECT array_agg(queue_name) INTO queue_names FROM pgjq.meta;
    
    -- Return early if no queues exist
    IF queue_names IS NULL THEN
        RETURN;
    END IF;
    
    -- Process each queue name from the array
    FOR i IN 1..array_length(queue_names, 1) LOOP
        SELECT * FROM pgjq.metrics(queue_names[i]) INTO result_row;
        RETURN NEXT result_row;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- get metrics total
CREATE TYPE pgjq.metrics_total_result AS (
    total_queues bigint,
    total_jobs bigint,
    pending_count bigint,
    failed_count bigint,
    staled_count bigint,
    completed_count bigint,
    cancelled_count bigint,
    active_count bigint
);

CREATE FUNCTION pgjq.metrics_total()
RETURNS pgjq.metrics_total_result AS $$
DECLARE
    result_row pgjq.metrics_total_result;
    query TEXT;
BEGIN
    query := $QUERY$
        SELECT
            COUNT(DISTINCT queue_name) AS total_queues,
            SUM(total_jobs) AS total_jobs,
            SUM(pending_count) AS pending_count,
            SUM(failed_count) AS failed_count,
            SUM(staled_count) AS staled_count,
            SUM(completed_count) AS completed_count,
            SUM(cancelled_count) AS cancelled_count,
            SUM(active_count) AS active_count
        FROM pgjq.metrics_all()
    $QUERY$;
    
    EXECUTE query INTO result_row;
    RETURN result_row;
END;
$$ LANGUAGE plpgsql;


-- list queues
CREATE FUNCTION pgjq."list_queues"()
RETURNS SETOF pgjq.queue_record AS $$
BEGIN
  RETURN QUERY SELECT * FROM pgjq.meta;
END
$$ LANGUAGE plpgsql;

-- purge queue, deleting all entries in it.
CREATE OR REPLACE FUNCTION pgjq."purge_queue"(queue_name TEXT)
RETURNS BIGINT AS $$
DECLARE
  deleted_count INTEGER;
  qtable TEXT := pgjq.format_table_name(queue_name, 'q');
BEGIN
  -- Get the row count before truncating
  EXECUTE format('SELECT count(*) FROM pgjq.%I', qtable) INTO deleted_count;

  -- Use TRUNCATE for better performance on large tables
  EXECUTE format('TRUNCATE TABLE pgjq.%I', qtable);

  -- Log the purge operation
  PERFORM pgjq.log_job_operation('ALL', queue_name, 'purge');

  -- Return the number of purged rows
  RETURN deleted_count;
END
$$ LANGUAGE plpgsql;


-- pop a single job
CREATE FUNCTION pgjq.dequeue(queue_name TEXT)
RETURNS SETOF pgjq.job_record AS $$
DECLARE
    sql TEXT;
    result pgjq.job_record;
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
BEGIN
    -- First mark any stale jobs
    -- PERFORM pgjq.mark_stale_jobs(queue_name);

    sql := FORMAT(
        $QUERY$
        WITH cte AS
            (
                SELECT job_id
                FROM pgjq.%I
                WHERE status = 'pending'
                ORDER BY priority DESC, job_id ASC
                LIMIT 1
                FOR UPDATE OF %I SKIP LOCKED
            )
        UPDATE pgjq.%I m
        SET 
            status = 'active'::pgjq.job_status,
            read_ct = read_ct + 1,
            dequeued_at = (now() AT TIME ZONE 'UTC')
        WHERE job_id = (select job_id from cte)
        RETURNING job_id, read_ct, enqueued_at, dequeued_at, staled_at, 
                completed_at, cancelled_at, failed_at, job, headers, 
                status, stale_after, priority;
        $QUERY$,
        qtable, qtable, qtable
    );
    
    FOR result IN EXECUTE sql LOOP
        -- Log the dequeue operation
        PERFORM pgjq.log_job_operation(result.job_id, queue_name, 'dequeue');
        RETURN NEXT result;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pgjq.drop_queue(queue_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
    fq_qtable TEXT := 'pgjq.' || qtable;
    partitioned BOOLEAN;
BEGIN
    EXECUTE FORMAT(
        $QUERY$
        SELECT is_partitioned FROM pgjq.meta WHERE queue_name = %L
        $QUERY$,
        queue_name
    ) INTO partitioned;

    IF pgjq._extension_exists('pgjq') THEN
        EXECUTE FORMAT(
            $QUERY$
            ALTER EXTENSION pgjq DROP TABLE pgjq.%I
            $QUERY$,
            qtable
        );
    END IF;

    EXECUTE FORMAT(
        $QUERY$
        DROP TABLE IF EXISTS pgjq.%I
        $QUERY$,
        qtable
    );

     IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'meta' and table_schema = 'pgjq'
     ) THEN
        EXECUTE FORMAT(
            $QUERY$
            DELETE FROM pgjq.meta WHERE queue_name = %L
            $QUERY$,
            queue_name
        );
     END IF;

    -- Log the drop queue operation
    PERFORM pgjq.log_job_operation('ALL', queue_name, 'drop_queue');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pgjq.validate_queue_name(queue_name TEXT)
RETURNS void AS $$
BEGIN
  IF length(queue_name) >= 48 THEN
    RAISE EXCEPTION 'queue name is too long, maximum length is 48 characters';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pgjq._belongs_to_pgjq(table_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    sql TEXT;
    result BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_depend
    WHERE refobjid = (SELECT oid FROM pg_extension WHERE extname = 'pgjq')
    AND objid = (
        SELECT oid
        FROM pg_class
        WHERE relname = table_name
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pgjq.create_queue(queue_name TEXT)
RETURNS void AS $$
DECLARE
  qtable TEXT := pgjq.format_table_name(queue_name, 'q');
BEGIN
  PERFORM pgjq.validate_queue_name(queue_name);

  EXECUTE FORMAT(
    $QUERY$
    CREATE TABLE IF NOT EXISTS pgjq.%I (
        job_id VARCHAR(10) PRIMARY KEY,
        read_ct INT DEFAULT 0 NOT NULL,
        enqueued_at TIMESTAMP DEFAULT (now() AT TIME ZONE 'UTC') NOT NULL,
        dequeued_at TIMESTAMP,
        staled_at TIMESTAMP,
        completed_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        failed_at TIMESTAMP,
        job JSONB,
        headers JSONB,
        status pgjq.job_status DEFAULT 'pending' NOT NULL,
        stale_after INTERVAL DEFAULT '1 minute' NOT NULL,
        priority INTEGER DEFAULT 0 NOT NULL CHECK (priority >= 0)
    )
    $QUERY$,
    qtable
  );

  IF pgjq._extension_exists('pgjq') THEN
      IF NOT pgjq._belongs_to_pgjq(qtable) THEN
          EXECUTE FORMAT('ALTER EXTENSION pgjq ADD TABLE pgjq.%I', qtable);
      END IF;
  END IF;

  EXECUTE FORMAT(
    $QUERY$
    CREATE INDEX IF NOT EXISTS %I ON pgjq.%I (status, priority DESC, job_id ASC);
    $QUERY$,
    qtable || '_status_priority_idx', qtable
  );

  EXECUTE FORMAT(
    $QUERY$
    INSERT INTO pgjq.meta (queue_name, is_partitioned, is_unlogged)
    VALUES (%L, false, false)
    ON CONFLICT (queue_name)
    DO NOTHING;
    $QUERY$,
    queue_name
  );

  -- Log the create queue operation
  PERFORM pgjq.log_job_operation('ALL', queue_name, 'create_queue');
END;
$$ LANGUAGE plpgsql;



CREATE FUNCTION pgjq._extension_exists(extension_name TEXT)
    RETURNS BOOLEAN
    LANGUAGE SQL
AS $$
SELECT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = extension_name
)
$$;



-- ack: mark a job as completed and archive it
CREATE FUNCTION pgjq.ack(
    queue_name TEXT,
    job_id VARCHAR(10)
)
RETURNS BOOLEAN AS $$
DECLARE
    sql TEXT;
    result VARCHAR(10);
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
BEGIN
    sql := FORMAT(
        $QUERY$
        UPDATE pgjq.%I
        SET 
            status = 'completed'::pgjq.job_status,
            completed_at = (now() AT TIME ZONE 'UTC')
        WHERE job_id = $1
        AND status = 'active'
        RETURNING job_id;
        $QUERY$,
        qtable
    );
    EXECUTE sql USING job_id INTO result;
    
    IF result IS NOT NULL THEN
        PERFORM pgjq.log_job_operation(job_id, queue_name, 'ack');
    END IF;
    
    RETURN NOT (result IS NULL);
END;
$$ LANGUAGE plpgsql;

-- nack: mark a job as failed and archive it
CREATE FUNCTION pgjq.nack(
    queue_name TEXT,
    job_id VARCHAR(10)
)
RETURNS BOOLEAN AS $$
DECLARE
    sql TEXT;
    result VARCHAR(10);
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
BEGIN
    sql := FORMAT(
        $QUERY$
        UPDATE pgjq.%I
        SET 
            status = 'failed'::pgjq.job_status,
            failed_at = (now() AT TIME ZONE 'UTC')
        WHERE job_id = $1
        AND status = 'active'
        RETURNING job_id;
        $QUERY$,
        qtable
    );
    EXECUTE sql USING job_id INTO result;
    
    IF result IS NOT NULL THEN
        PERFORM pgjq.log_job_operation(job_id, queue_name, 'nack');
    END IF;
    
    RETURN NOT (result IS NULL);
END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION pgjq.queue_exists(queue_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM pgjq.meta 
    WHERE meta.queue_name = queue_exists.queue_name
  );
END;
$$ LANGUAGE plpgsql;

-- Add function to mark stale jobs
CREATE FUNCTION pgjq.mark_stale_jobs(queue_name TEXT)
RETURNS SETOF VARCHAR(10) AS $$
DECLARE
    sql TEXT;
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
    job_id VARCHAR(10);
BEGIN
    sql := FORMAT(
        $QUERY$
        UPDATE pgjq.%I
        SET 
            status = 'stale'::pgjq.job_status,
            staled_at = (now() AT TIME ZONE 'UTC')
        WHERE status = 'active'
        AND dequeued_at < (now() AT TIME ZONE 'UTC') - stale_after
        RETURNING job_id;
        $QUERY$,
        qtable
    );
    
    FOR job_id IN EXECUTE sql LOOP
        -- Log the stale job operation
        PERFORM pgjq.log_job_operation(job_id, queue_name, 'mark_stale');
        RETURN NEXT job_id;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create a table to track the last time we checked for stale jobs
CREATE TABLE pgjq.stale_check_timestamp (
    last_check TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert initial timestamp
INSERT INTO pgjq.stale_check_timestamp (last_check) VALUES (now());

-- Create function to check and mark stale jobs
CREATE OR REPLACE FUNCTION pgjq.check_stale_jobs()
RETURNS void AS $$
DECLARE
    q RECORD;
    check_interval INTERVAL := '1 minute';
    last_ts TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get last check timestamp
    SELECT last_check INTO last_ts FROM pgjq.stale_check_timestamp;
    
    -- Only proceed if enough time has passed
    IF (now() - last_ts) >= check_interval THEN
        -- Loop through all queues
        FOR q IN SELECT queue_name FROM pgjq.meta LOOP
            -- Mark stale jobs for each queue
            PERFORM pgjq.mark_stale_jobs(q.queue_name);
        END LOOP;

        -- Update last check timestamp
        UPDATE pgjq.stale_check_timestamp SET last_check = now();
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to list jobs with pagination and filtering
CREATE OR REPLACE FUNCTION pgjq.list_jobs(
    queue_name TEXT,
    page INTEGER DEFAULT 1,
    per_page INTEGER DEFAULT 50,
    sort_by TEXT DEFAULT 'job_id',
    sort_dir TEXT DEFAULT 'ASC',
    statuses pgjq.job_status[] DEFAULT NULL
)
RETURNS SETOF pgjq.job_record AS $$
DECLARE
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
    offset_val INTEGER;
    where_clause TEXT;
    order_clause TEXT;
    query TEXT;
BEGIN
    -- Validate parameters
    IF page < 1 THEN
        RAISE EXCEPTION 'page must be greater than 0';
    END IF;

    IF per_page < 1 THEN
        RAISE EXCEPTION 'per_page must be greater than 0';
    END IF;

    IF per_page > 1000 THEN
        RAISE EXCEPTION 'per_page must not exceed 1000';
    END IF;

    -- Validate sort_by column
    IF sort_by NOT IN ('job_id', 'read_ct', 'enqueued_at', 'dequeued_at', 'status', 'priority') THEN
        RAISE EXCEPTION 'Invalid sort_by parameter. Must be one of: job_id, read_ct, enqueued_at, dequeued_at, status, priority';
    END IF;

    -- Validate sort direction
    IF upper(sort_dir) NOT IN ('ASC', 'DESC') THEN
        RAISE EXCEPTION 'Invalid sort_dir parameter. Must be either ASC or DESC';
    END IF;

    -- Calculate offset
    offset_val := (page - 1) * per_page;

    -- Build WHERE clause for status filtering
    IF statuses IS NOT NULL AND array_length(statuses, 1) > 0 THEN
        where_clause := format('WHERE status = ANY(%L)', statuses);
    ELSE
        where_clause := '';
    END IF;

    -- Build ORDER BY clause
    order_clause := format('ORDER BY %I %s', sort_by, sort_dir);

    -- Build and execute query to return jobs directly
    query := format(
        'SELECT 
            job_id,
            read_ct,
            enqueued_at,
            dequeued_at,
            staled_at,
            completed_at,
            cancelled_at,
            failed_at,
            job,
            headers,
            status,
            stale_after,
            priority
        FROM pgjq.%I
        %s
        %s
        LIMIT %L OFFSET %L',
        qtable,
        where_clause,
        order_clause,
        per_page,
        offset_val
    );
    
    RETURN QUERY EXECUTE query;
END;
$$ LANGUAGE plpgsql;

-- Get a specific job by ID
CREATE OR REPLACE FUNCTION pgjq.get_job(queue_name TEXT, job_id TEXT)
RETURNS SETOF pgjq.job_record AS $$
DECLARE
    qtable TEXT := pgjq.format_table_name(queue_name, 'q');
    query TEXT;
BEGIN
    -- Validate inputs
    IF queue_name IS NULL OR job_id IS NULL THEN
        RAISE EXCEPTION 'queue_name and job_id cannot be null';
    END IF;

    -- Build and execute query to return the specific job
    query := format(
        'SELECT 
            job_id,
            read_ct,
            enqueued_at,
            dequeued_at,
            staled_at,
            completed_at,
            cancelled_at,
            failed_at,
            job,
            headers,
            status,
            stale_after,
            priority
        FROM pgjq.%I
        WHERE job_id = %L',
        qtable,
        job_id
    );
    
    RETURN QUERY EXECUTE query;
END;
$$ LANGUAGE plpgsql;
