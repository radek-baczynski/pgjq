import { ReactNode } from "react";

export default function QueuesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex space-x-4">
            <a
              href="/queues"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Dashboard
            </a>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-4">{children}</main>
    </div>
  );
}
