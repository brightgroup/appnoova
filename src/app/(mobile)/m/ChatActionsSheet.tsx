"use client";

import type { InboxListItem } from "@/types/inbox";
import { ArchiveIcon, ArchiveRestoreIcon, SparkleIcon, UserIcon } from "./icons";

interface ChatActionsSheetAssignee {
  user_id: string;
  name: string;
}

interface ChatActionsSheetProps {
  item: InboxListItem;
  currentUserName: string;
  assignees: ChatActionsSheetAssignee[];
  onArchive: (archived: boolean) => void;
  onAssign: (value: "ai" | "me" | string) => void;
  onClose: () => void;
}

export function ChatActionsSheet({
  item,
  currentUserName,
  assignees,
  onArchive,
  onAssign,
  onClose
}: ChatActionsSheetProps) {
  const otherAssignees = assignees.filter(a => a.name !== currentUserName);

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Acciones de la conversación">
        <div className="sheet-handle" />
        <div className="sheet-title">{item.display_title}</div>

        <button type="button" className="sheet-row" onClick={() => onArchive(!item.archived_at)}>
          {item.archived_at ? (
            <ArchiveRestoreIcon width={18} height={18} />
          ) : (
            <ArchiveIcon width={18} height={18} />
          )}
          <span className="srow-name">{item.archived_at ? "Desarchivar" : "Archivar"}</span>
        </button>

        <div className="sheet-subject">Asignar a</div>

        <button type="button" className="sheet-row" onClick={() => onAssign("ai")}>
          <SparkleIcon width={18} height={18} />
          <span className="srow-name">Agente (IA)</span>
        </button>
        <button type="button" className="sheet-row" onClick={() => onAssign("me")}>
          <UserIcon width={18} height={18} />
          <span className="srow-name">Mí ({currentUserName})</span>
        </button>
        {otherAssignees.map(a => (
          <button key={a.user_id} type="button" className="sheet-row" onClick={() => onAssign(a.name)}>
            <UserIcon width={18} height={18} />
            <span className="srow-name">{a.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
