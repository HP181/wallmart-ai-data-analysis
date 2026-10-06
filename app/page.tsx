import { ChatInterface } from "@/components/chat-interface";

export default function Home() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <main className="flex-1 min-h-0">
        <ChatInterface />
      </main>
    </div>
  );
}
