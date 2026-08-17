import { ChatContent } from "@/components/chat/ChatContent";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ resumeId?: string }>;
}) {
  const sp = await searchParams;
  return <ChatContent conversationId={null} resumeId={sp.resumeId ?? null} />;
}
