import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTasks, useCreateTask, useUpdateTask, useTopics, usePageView } from '../api/hooks';
import { useAuthStore } from '../store/auth.store';
import { Card, CardBody } from '../components/common/Card';
import { Badge, getStatusVariant } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';
import { Markdown } from '../components/common/Markdown';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import type { TaskStatus } from '@cortex/shared';

type FilterStatus = 'all' | 'open' | 'in_progress' | 'done';

const filters: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export function Tasks() {
  usePageView('tasks');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [showNewTask, setShowNewTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '', body: '', topic_id: '', priority: 'medium', tags: '', due_date: '',
  });

  const { data: tasksData, isLoading } = useTasks({
    status: activeFilter === 'all' ? undefined : activeFilter,
    limit: 50,
  });
  const { data: topics } = useTopics();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { isContributor } = useAuthStore();

  const tasks = tasksData?.data || [];
  const [reopeningTaskId, setReopeningTaskId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    updateTask.mutate({ id: taskId, status });
  };

  const handleReopen = (taskId: string, currentBody: string | null) => {
    const reasonBlock = reopenReason.trim()
      ? `**Reopened:** ${reopenReason.trim()}\n\n---\n\n`
      : `**Reopened** (no reason given)\n\n---\n\n`;
    const newBody = currentBody ? reasonBlock + currentBody : reasonBlock.replace(/\n\n---\n\n$/, '');
    updateTask.mutate({ id: taskId, status: 'open' as TaskStatus, body: newBody }, {
      onSuccess: () => {
        setReopeningTaskId(null);
        setReopenReason('');
      },
    });
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    createTask.mutate({
      title: taskForm.title,
      body: taskForm.body || undefined,
      topic_id: taskForm.topic_id || undefined,
      priority: taskForm.priority as 'low' | 'medium' | 'high',
      due_date: taskForm.due_date || undefined,
      tags: taskForm.tags ? taskForm.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    }, {
      onSuccess: () => {
        setShowNewTask(false);
        setTaskForm({ title: '', body: '', topic_id: '', priority: 'medium', tags: '', due_date: '' });
      },
    });
  };

  if (isLoading) {
    return <LoadingState message="Loading tasks..." />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        {isContributor() && (
          <Button size="sm" onClick={() => setShowNewTask(!showNewTask)}>
            {showNewTask ? 'Cancel' : 'New Task'}
          </Button>
        )}
      </div>

      {/* New Task form */}
      {showNewTask && (
        <Card className="mb-6">
          <CardBody>
            <form onSubmit={handleCreateTask}>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Create Task</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Task title *"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                />
                <textarea
                  value={taskForm.body}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Description (optional, supports markdown)"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm resize-none"
                />
                <div className="grid grid-cols-3 gap-3">
                  <select
                    value={taskForm.topic_id}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, topic_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                  >
                    <option value="">No topic</option>
                    {topics?.map((topic) => (
                      <option key={topic.id} value={topic.id}>{topic.name}</option>
                    ))}
                  </select>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                  >
                    <option value="low">Low priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="high">High priority</option>
                  </select>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                  />
                </div>
                <input
                  type="text"
                  value={taskForm.tags}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="Tags (comma-separated)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewTask(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={createTask.isPending} disabled={!taskForm.title.trim()}>
                    Create Task
                  </Button>
                </div>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeFilter === filter.value
                ? 'bg-cortex-100 text-cortex-700'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Tasks list */}
      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description={
            activeFilter === 'all'
              ? "No tasks yet. Create one to track work for yourself or your agents."
              : `No ${activeFilter.replace('_', ' ')} tasks.`
          }
          icon={<EmptyIcon />}
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getStatusVariant(task.status)}>
                        {task.status.replace('_', ' ')}
                      </Badge>
                      <Badge variant={getStatusVariant(task.priority)}>
                        {task.priority}
                      </Badge>
                      {task.topic_id && topics && (
                        <Link
                          to={`/topics/${task.topic_id}`}
                          className="text-xs text-gray-400 hover:text-cortex-600"
                        >
                          {topics.find(t => t.id === task.topic_id)?.name || 'Topic'}
                        </Link>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900 text-base">{task.title}</h3>

                    {task.body && (
                      <div className="mt-2 max-h-48 overflow-y-auto prose prose-sm text-gray-700">
                        <Markdown>{task.body}</Markdown>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-3">
                      <span>by {task.creator.display_name}</span>
                      {task.assignee && (
                        <>
                          <span>·</span>
                          <span>assigned to {task.assignee.display_name}</span>
                        </>
                      )}
                      {task.due_date && (
                        <>
                          <span>·</span>
                          <span>due {format(new Date(task.due_date), 'MMM d, yyyy')}</span>
                        </>
                      )}
                      {task.thread_id && (
                        <>
                          <span>·</span>
                          <Link
                            to={`/threads/${task.thread_id}`}
                            className="text-cortex-600 hover:text-cortex-700 hover:underline"
                          >
                            View discussion &rarr;
                          </Link>
                        </>
                      )}
                    </div>

                    {task.tags && task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {task.tags.map((tag) => (
                          <Badge key={tag} variant="gray">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2">
                    {task.status === 'open' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStatusChange(task.id, 'in_progress' as TaskStatus)}
                        loading={updateTask.isPending}
                      >
                        Start
                      </Button>
                    )}
                    {task.status === 'in_progress' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(task.id, 'done' as TaskStatus)}
                        loading={updateTask.isPending}
                      >
                        Complete
                      </Button>
                    )}
                    {(task.status === 'done' || task.status === 'cancelled') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setReopeningTaskId(reopeningTaskId === task.id ? null : task.id);
                          setReopenReason('');
                        }}
                      >
                        {reopeningTaskId === task.id ? 'Cancel' : 'Reopen'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Reopen feedback form */}
                {reopeningTaskId === task.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Why is this being reopened?
                    </label>
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Describe what's incomplete or needs rework (optional)"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm resize-none"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setReopeningTaskId(null); setReopenReason(''); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleReopen(task.id, task.body)}
                        loading={updateTask.isPending}
                      >
                        Reopen Task
                      </Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
