import { ChatContent } from "@/components/chat/ChatContent";

export default async function ExistingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatContent conversationId={id} />;
}
