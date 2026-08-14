import { MobileChatContent } from "@/components/chat/mobile/MobileChatContent";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MobileExistingChatPage({ params }: Props) {
  const { id } = await params;
  return <MobileChatContent conversationId={id} />;
}
