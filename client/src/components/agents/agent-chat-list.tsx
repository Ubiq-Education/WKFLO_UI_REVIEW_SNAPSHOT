import { useState, useContext } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import useAuth from "@/hooks/use-auth";
import { Trash } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { generateGuid } from "@shared/utils/session-manager";
import { DataContext } from '@shared/models/chat-models';

// Chat session interface
interface ChatSession {
  agentId: number;
  sessionId: string;
  name: string;
  createdAt: string;
  totalThumbsUp: number;
  totalThumbsDown: number;
}

interface AgentChatListProps {
  agentId: number;
  onSelectSession: (session: {sessionId: string, chatName: string | null }) => void;
  selectedSession?:  {sessionId: string, chatName: string | null };
}

export default function AgentChatList({ agentId, onSelectSession, selectedSession }: AgentChatListProps) {
  const token = useAuth();
  const context = useContext(DataContext);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: chats = [], isLoading, refetch } = useQuery<ChatSession[]>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}/chats`, token, context.selectedTenantGuid],
    enabled: !!agentId && !!token && !!context.selectedTenantGuid,
    refetchOnWindowFocus: true,
  });

  const createChatMutation = useMutation({
    mutationFn: async () => {
      const sessionId = generateGuid();
      await apiRequest("POST", `/md/api/v1/tenant/agent/${agentId}/chat`, { sessionId }, token);
      return sessionId;
    },
    onSuccess: async (sessionId: string) => {
      await refetch();
      onSelectSession({ sessionId, chatName: null });
    }
  });

  const deleteChatMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/md/api/v1/tenant/agent/${agentId}/chat/${sessionId}`, {}, token);
    },
    onSuccess: async (_data, deletedSessionId) => {
      await refetch();
      setPendingDelete(null);
      // Only clear selection if the deleted session is the selected one
      if (selectedSession?.sessionId === deletedSessionId) {
        onSelectSession({ sessionId: generateGuid(), chatName: null });
      }
      toast({
        title: "Chat session deleted",
        description: `The chat session has been deleted successfully.`,
      });
    }
  });

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full mb-2"
        onClick={() => createChatMutation.mutate()}
        disabled={createChatMutation.isPending}
      >
        + New Chat
      </Button>
      {isLoading ? (
        <>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </>
      ) : !chats || !Array.isArray(chats) || chats.length === 0 ? (
        <div className="text-sm text-gray-500">No chat sessions found.</div>
      ) : (
        chats.map((chat) => (
          <div key={chat.sessionId} className="relative group" role="group" aria-label={chat.name?.slice(0, 26) || `Session ${chat.sessionId.slice(-6)}`}>
            <Button
              variant={selectedSession?.sessionId === chat.sessionId ? "default" : "outline"}
              className="w-full justify-start pr-10 cursor-pointer"
              onClick={() => { onSelectSession({ sessionId: chat.sessionId, chatName: chat.name }); }}
            >
              <span className="flex flex-col items-start w-full">
                <span className="truncate font-medium">
                  {chat.name?.slice(0, 26) || `Session ${chat.sessionId.slice(-6)}`}
                </span>
                {chat.createdAt && (
                  <span className="text-xs text-gray-400">
                    {new Date(chat.createdAt).toLocaleString()}
                  </span>
                )}
              </span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant={selectedSession?.sessionId === chat.sessionId ? "default" : "outline"}
                  className="absolute h-8 right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(chat.sessionId);
                  }}
                  title="Delete chat"
                >
                  <Trash className="w-4 h-4 text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Chat Session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this chat session? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPendingDelete(null)}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (pendingDelete) {
                        deleteChatMutation.mutate(pendingDelete);
                      }
                    }}
                    disabled={deleteChatMutation.isPending}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))
      )}
    </div>
  );
}