import { useDraggable, useDroppable } from '@dnd-kit/core';

export function DraggableChip({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    opacity: isDragging ? 0.4 : 1, cursor: 'grab', touchAction: 'none',
  };
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes}>{children}</div>;
}

export function DroppableCell({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <td ref={setNodeRef} className={className}
      style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'top', background: isOver ? 'rgba(99,102,241,0.08)' : undefined, transition: 'background 0.15s' }}>
      {children}
    </td>
  );
}

export function TrashZone({ zh }: { zh: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash|trash' });
  return (
    <div ref={setNodeRef} style={{
      padding: '8px 16px', textAlign: 'center', fontSize: '12px',
      borderRadius: 'var(--radius-sm)', marginTop: '8px',
      border: `2px dashed ${isOver ? '#f43f5e' : 'var(--outline-variant)'}`,
      background: isOver ? 'rgba(244,63,94,0.08)' : 'transparent',
      color: isOver ? '#f43f5e' : 'var(--text-muted)', transition: 'all 0.15s',
    }}>
      🗑️ {zh ? '拖曳至此移除班次' : 'Drop here to unassign'}
    </div>
  );
}

export function DraggableTemplate({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    opacity: isDragging ? 0.5 : 1, cursor: 'grab', touchAction: 'none', display: 'inline-block',
  };
  return <div ref={setNodeRef} style={style} {...listeners} {...attributes}>{children}</div>;
}
