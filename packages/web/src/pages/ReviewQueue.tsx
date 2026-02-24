import { Link } from 'react-router-dom';
import { useArtifacts, useAcceptArtifact, useRejectArtifact, usePageView } from '../api/hooks';
import { Card, CardBody } from '../components/common/Card';
import { Badge, getTypeVariant } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { format } from 'date-fns';

export function ReviewQueue() {
  usePageView('review-queue');
  const { data: artifactsData, isLoading } = useArtifacts({
    status: 'proposed',
    limit: 50,
  });
  const acceptArtifact = useAcceptArtifact();
  const rejectArtifact = useRejectArtifact();

  const artifacts = artifactsData?.data || [];

  if (isLoading) {
    return <LoadingState message="Loading review queue..." />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve proposed artifacts
          </p>
        </div>
        {artifacts.length > 0 && (
          <Badge variant="yellow">{artifacts.length} pending</Badge>
        )}
      </div>

      {artifacts.length === 0 ? (
        <EmptyState
          title="All caught up!"
          description="There are no artifacts waiting for review."
          icon={
            <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      ) : (
        <div className="space-y-4">
          {artifacts.map((artifact) => (
            <Card key={artifact.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={getTypeVariant(artifact.type)}>
                        {artifact.type}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        in {artifact.topic.name}
                      </span>
                    </div>

                    <Link
                      to={`/artifacts/${artifact.id}`}
                      className="font-medium text-gray-900 hover:text-cortex-600"
                    >
                      {artifact.title}
                    </Link>

                    {artifact.summary && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {artifact.summary}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                      <span>by {artifact.creator.display_name}</span>
                      <span>·</span>
                      <span>{format(new Date(artifact.created_at), 'MMM d, yyyy')}</span>
                    </div>

                    {artifact.tags && artifact.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {artifact.tags.map((tag) => (
                          <Badge key={tag} variant="gray">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Review actions */}
                  <div className="flex gap-2">
                    <Link to={`/artifacts/${artifact.id}`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => rejectArtifact.mutate(artifact.id)}
                      loading={rejectArtifact.isPending}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptArtifact.mutate(artifact.id)}
                      loading={acceptArtifact.isPending}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
