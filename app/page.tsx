import { ChatInterface } from "@/components/chat-interface";
// import { HeaderActions } from "@/components/header-actions";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart2, Database, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
     

      <main className="flex-1 min-h-0">
        <ChatInterface />
      </main>
    </div>
  );
}
