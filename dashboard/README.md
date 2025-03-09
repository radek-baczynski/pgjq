# PGJQ Dashboard

A modern web dashboard for monitoring and managing PostgreSQL job queues using PGJQ.

## Features

- Real-time queue monitoring
- Job processing metrics and visualization
- Queue management interface
- Job status tracking
- Responsive design
- Secure server-side database access

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   Create a `.env.local` file with your PostgreSQL connection string:
   ```
   # Server-side only variable (not exposed to the client)
   PGJQ_DSN=postgresql://user:password@localhost:5432/dbname
   ```

4. Run the development server:
   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the dashboard.

## Architecture

- Next.js App Router for server-side rendering and API routes
- Server-side database access via API routes for security
- Client-side components fetch data from API routes
- Real-time updates with polling

## Development

- Built with Next.js 14
- Uses Tremor for UI components and charts
- TypeScript for type safety
- Tailwind CSS for styling

## License

MIT
