import { clsx } from 'clsx';

type BadgeVariant = 'blue' | 'green' | 'yellow' | 'red' | 'gray' | 'purple';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-800',
  purple: 'bg-purple-100 text-purple-800',
};

export function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// Helper function to get badge variant based on status/type
export function getStatusVariant(status: string): BadgeVariant {
  const statusMap: Record<string, BadgeVariant> = {
    // Thread status
    open: 'blue',
    resolved: 'green',
    archived: 'gray',
    // Task status
    in_progress: 'yellow',
    done: 'green',
    cancelled: 'gray',
    // Artifact status
    draft: 'gray',
    proposed: 'purple',
    accepted: 'green',
    deprecated: 'red',
    // Priority
    low: 'gray',
    medium: 'yellow',
    high: 'red',
  };
  return statusMap[status] || 'gray';
}

export function getTypeVariant(type: string): BadgeVariant {
  const typeMap: Record<string, BadgeVariant> = {
    // Thread types
    question: 'blue',
    discussion: 'purple',
    decision: 'green',
    incident: 'red',
    // Artifact types
    procedure: 'blue',
    document: 'gray',
    glossary: 'purple',
    // Comment types
    reply: 'gray',
    observation: 'blue',
    test_result: 'green',
  };
  return typeMap[type] || 'gray';
}

// Pre-attentive status indicator — small colored dot for at-a-glance scanning
export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-blue-500',
    resolved: 'bg-green-500',
    archived: 'bg-gray-400',
    in_progress: 'bg-yellow-500',
    done: 'bg-green-500',
    cancelled: 'bg-gray-400',
    accepted: 'bg-green-500',
    deprecated: 'bg-red-500',
    draft: 'bg-gray-400',
    proposed: 'bg-purple-500',
  };
  return (
    <span
      className={clsx(
        'inline-block w-2 h-2 rounded-full flex-shrink-0',
        colors[status] || 'bg-gray-400'
      )}
    />
  );
}

// Left border color for thread/artifact type — pre-attentive visual grouping
export function getTypeBorderColor(type: string): string {
  const borders: Record<string, string> = {
    decision: 'border-l-emerald-500',
    question: 'border-l-blue-500',
    discussion: 'border-l-purple-500',
    incident: 'border-l-red-500',
    document: 'border-l-gray-400',
    procedure: 'border-l-blue-400',
    glossary: 'border-l-purple-400',
  };
  return borders[type] || 'border-l-gray-300';
}
