export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string | null;
  last_seen: string | null;
};

export type Conversation = {
  id: string;
  is_group: boolean;
  name: string | null;
  created_by: string | null;
  last_message_at: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  media_name: string | null;
  edited_at: string | null;
  deleted_for_everyone: boolean;
  created_at: string;
};

export type ConversationWithPeer = Conversation & {
  peer: Profile | null;
  last_message: Message | null;
  unread_for_me?: boolean;
};
