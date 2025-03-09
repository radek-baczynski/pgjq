import asyncio
import os
import asyncpg
import pathlib

async def install_pg_job_queue(dsn: str):
    """Install pg_job_queue schema and functions into PostgreSQL database.
    
    Args:
        dsn: Database connection string
    """
    conn = await asyncpg.connect(dsn)
    
    try:
        # Drop existing schema if it exists
        await conn.execute('DROP SCHEMA IF EXISTS pgjq CASCADE')
        
        # Read SQL file content
        sql_path = pathlib.Path(__file__).parent / "pgjq.sql"
        with open(sql_path) as f:
            sql = f.read()
            
        # Execute installation SQL
        await conn.execute(sql)
        
    finally:
        await conn.close()

def install(dsn: str):
    """Synchronous wrapper to install pg_job_queue"""
    asyncio.run(install_pg_job_queue(dsn))

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL")
    print(f"Installing pg_job_queue into {DATABASE_URL}")
    install(DATABASE_URL)
