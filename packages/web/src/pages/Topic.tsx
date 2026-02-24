import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTopic, useThreads, useArtifacts, useCreateThread, useCreateArtifact, useUpdateTopic, usePageView } from '../api/hooks';
import { useTrackEvent } from '../api/hooks/useTrackEvent';
import { useLatestBriefing, useGenerateBriefing, useDetectContradictions, useGenerateTopicSynthesis, useDetectStaleness, useLatestPlan, useGeneratePlan, useLatestResearch, useResearch, useFirstPrinciplesQuestions, useFirstPrinciplesSuggest, useLatestScorecard, useGenerateScorecard, usePipelinePolling, useCancelTopicJobs, useLatestConclusion, useGenerateConclusion } from '../api/hooks/useAiTeam';
import type { ScorecardOutput, ScorecardCriterion, PracticalWin, PipelineStage } from '../api/hooks/useAiTeam';
import type { TopicLifecycleState } from '@cortex/shared';
import { useAuthStore } from '../store/auth.store';
import { Card, CardBody } from '../components/common/Card';
import { Badge, getStatusVariant, getTypeVariant, StatusDot, getTypeBorderColor } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { LoadingState, Spinner } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';
import { Markdown } from '../components/common/Markdown';
import { clsx } from 'clsx';
import { Tooltip, InfoTip } from '../components/common/Tooltip';
import { relativeTime } from '../utils/time';

type Tab = 'threads' | 'artifacts';

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={clsx('w-4 h-4 transition-transform', expanded && 'rotate-90')}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function BriefingCard({ topicId }: { topicId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [taskDesc, setTaskDesc] = useState('');
  const trackEvent = useTrackEvent();
  const briefingViewed = useRef(false);
  const { data: briefing, isLoading, isError } = useLatestBriefing(topicId);
  const generate = useGenerateBriefing();

  // Track briefing.viewed when expanded — must be before early returns to satisfy Rules of Hooks
  useEffect(() => {
    if (expanded && !briefingViewed.current) {
      briefingViewed.current = true;
      trackEvent('briefing.viewed', { topic_id: topicId });
    }
  }, [expanded, trackEvent, topicId]);

  if (isLoading) return null;

  // No briefing yet — show generate prompt
  if (isError || !briefing) {
    return (
      <Card className="mb-4">
        <CardBody>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            Session Briefing
            <InfoTip text="AI-generated summary of this topic's current state, recent activity, and suggested next steps. Helps you quickly get up to speed." />
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            Generate an AI briefing to quickly orient yourself on this topic.
          </p>
          <textarea
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            placeholder="What are you working on? (optional — scopes the briefing)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-cortex-500"
          />
          <Button
            size="sm"
            onClick={() => generate.mutate({
              topic_id: topicId,
              task_description: taskDesc || undefined,
            }, {
              onSuccess: () => trackEvent('briefing.generated', { topic_id: topicId }),
            })}
            loading={generate.isPending}
          >
            {generate.isPending ? 'Generating briefing...' : 'Generate Briefing'}
          </Button>
          {generate.isSuccess && generate.data && (
            <div className="mt-4 pt-4 border-t max-h-[600px] overflow-y-auto prose prose-sm">
              <Markdown>{generate.data.content}</Markdown>
            </div>
          )}
          {generate.isError && (
            <p className="mt-2 text-sm text-red-600">
              {(generate.error as Error)?.message || 'Failed to generate briefing'}
            </p>
          )}
        </CardBody>
      </Card>
    );
  }

  // Have a briefing — show it
  const content = (briefing.output as { content?: string } | null)?.content;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 mb-2"
      >
        <ChevronIcon expanded={expanded} />
        Session Briefing
        <span className="text-xs font-normal text-gray-400 ml-2">
          {relativeTime(briefing.created_at)}
        </span>
      </button>
      {expanded && (
        <Card className="mb-2">
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {briefing.tokens_used && (
                  <span>{briefing.tokens_used.toLocaleString()} tokens</span>
                )}
                {briefing.cost_usd != null && (
                  <span>· ${typeof briefing.cost_usd === 'number' ? briefing.cost_usd.toFixed(3) : briefing.cost_usd}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="What are you working on? (scopes the briefing)"
                  className="px-2 py-1 border border-gray-300 rounded text-xs w-48 focus:outline-none focus:ring-1 focus:ring-cortex-500"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => generate.mutate({
                    topic_id: topicId,
                    task_description: taskDesc || undefined,
                  })}
                  loading={generate.isPending}
                >
                  {generate.isPending ? 'Regenerating...' : 'Regenerate'}
                </Button>
              </div>
            </div>
            {content ? (
              <div className="max-h-[600px] overflow-y-auto prose prose-sm">
                <Markdown>{content}</Markdown>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No content available.</p>
            )}
            {generate.isSuccess && generate.data && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-green-600 mb-2 font-medium">New briefing generated:</p>
                <div className="max-h-[600px] overflow-y-auto prose prose-sm">
                  <Markdown>{generate.data.content}</Markdown>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function AiActionsPanel({ topicId, artifactCount, resolvedThreadCount, onSwitchToArtifacts }: { topicId: string; artifactCount: number; resolvedThreadCount: number; onSwitchToArtifacts: () => void }) {
  const detectContradictions = useDetectContradictions();
  const generateSynthesis = useGenerateTopicSynthesis();
  const detectStaleness = useDetectStaleness();

  const hasEnoughArtifacts = artifactCount >= 5;
  const hasEnoughResolved = resolvedThreadCount >= 3;

  if (!hasEnoughArtifacts && !hasEnoughResolved) return null;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        {hasEnoughArtifacts && (
          <Tooltip content="AI scans all artifacts for conflicting claims or contradictory decisions. Results are posted as a thread.">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => detectContradictions.mutate({ topic_id: topicId })}
              loading={detectContradictions.isPending}
            >
              {detectContradictions.isPending ? 'Detecting...' : 'Detect Contradictions'}
            </Button>
          </Tooltip>
        )}
        {hasEnoughResolved && (
          <Tooltip content="AI generates a narrative synthesis of all resolved threads, connecting findings into a coherent story. Creates a draft artifact.">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => generateSynthesis.mutate({ topic_id: topicId })}
              loading={generateSynthesis.isPending}
            >
              {generateSynthesis.isPending ? 'Generating...' : 'Generate Synthesis'}
            </Button>
          </Tooltip>
        )}
        {hasEnoughArtifacts && (
          <Tooltip content="AI checks for outdated or potentially stale artifacts that may need updating based on newer findings. Results are posted as a thread.">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => detectStaleness.mutate({ topic_id: topicId })}
              loading={detectStaleness.isPending}
            >
              {detectStaleness.isPending ? 'Checking...' : 'Staleness Report'}
            </Button>
          </Tooltip>
        )}
      </div>
      {detectContradictions.isSuccess && detectContradictions.data?.posted_to && (
        <p className="text-xs text-green-600">
          Contradictions posted.{' '}
          <Link to={`/threads/${detectContradictions.data.posted_to.thread_id}`} className="underline font-medium">
            View thread &rarr;
          </Link>
        </p>
      )}
      {generateSynthesis.isSuccess && (
        <p className="text-xs text-green-600">
          Synthesis artifact created.{' '}
          <button onClick={onSwitchToArtifacts} className="underline font-medium">
            View in Artifacts tab &rarr;
          </button>
        </p>
      )}
      {detectStaleness.isSuccess && detectStaleness.data?.posted_to && (
        <p className="text-xs text-green-600">
          Staleness report posted.{' '}
          <Link to={`/threads/${detectStaleness.data.posted_to.thread_id}`} className="underline font-medium">
            View thread &rarr;
          </Link>
        </p>
      )}
    </div>
  );
}

function FirstPrinciplesSection({ topicId, firstPrinciples, canEdit }: { topicId: string; firstPrinciples: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(firstPrinciples || '');
  const updateTopic = useUpdateTopic();

  // Wizard state
  const [wizardStep, setWizardStep] = useState<'idle' | 'questions' | 'suggest'>('idle');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [additionalContext, setAdditionalContext] = useState('');
  const generateQuestions = useFirstPrinciplesQuestions();
  const generateSuggestion = useFirstPrinciplesSuggest();

  const handleSave = () => {
    updateTopic.mutate({ id: topicId, first_principles: draft }, {
      onSuccess: () => setEditing(false),
    });
  };

  const startWizard = () => {
    setWizardStep('questions');
    setAnswers({});
    setOtherTexts({});
    setAdditionalContext('');
    generateQuestions.mutate({ topic_id: topicId });
  };

  const closeWizard = () => {
    setWizardStep('idle');
    setAnswers({});
    setOtherTexts({});
    setAdditionalContext('');
    generateQuestions.reset();
    generateSuggestion.reset();
  };

  const submitAnswers = () => {
    const finalAnswers: Record<string, string> = {};
    const questions = generateQuestions.data?.questions || [];
    for (const [qId, answer] of Object.entries(answers)) {
      const q = questions.find((qq) => qq.id === qId);
      const questionText = q?.question || qId;
      if (answer === '__other__' && otherTexts[qId]) {
        finalAnswers[questionText] = otherTexts[qId];
      } else {
        const opt = q?.options.find((o) => o.value === answer);
        finalAnswers[questionText] = opt
          ? `${opt.label}${opt.description ? ` — ${opt.description}` : ''}`
          : answer;
      }
    }
    setWizardStep('suggest');
    generateSuggestion.mutate({
      topic_id: topicId,
      answers: finalAnswers,
      ...(additionalContext.trim() ? { additional_context: additionalContext.trim() } : {}),
    });
  };

  const acceptSuggestion = () => {
    if (generateSuggestion.data?.suggested) {
      updateTopic.mutate(
        { id: topicId, first_principles: generateSuggestion.data.suggested },
        { onSuccess: () => closeWizard() },
      );
    }
  };

  // --- EDITING MODE ---
  if (editing) {
    return (
      <div className="mb-6 bg-indigo-50/50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-indigo-800">First Principles</h3>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
          placeholder="Define guiding principles and success criteria for this topic (supports markdown)..."
        />
        <p className={clsx('text-xs mt-1 text-right', draft.length > 50000 ? 'text-red-500' : 'text-gray-400')}>
          {draft.length.toLocaleString()} / 50,000
        </p>
        <div className="flex justify-end gap-2 mt-2">
          <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setDraft(firstPrinciples || ''); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} loading={updateTopic.isPending} disabled={draft.length > 50000}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  // --- WIZARD MODE ---
  if (wizardStep !== 'idle') {
    return (
      <div className="mb-6 bg-indigo-50/50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-indigo-800">First Principles Wizard</h3>
          <button onClick={closeWizard} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>

        {/* Step 1: Questions */}
        {wizardStep === 'questions' && (
          <div>
            {generateQuestions.isPending && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Spinner className="w-4 h-4" />
                Analyzing topic and generating questions...
              </div>
            )}
            {generateQuestions.isError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {(generateQuestions.error as Error)?.message || 'Failed to generate questions'}
                <Button size="sm" variant="secondary" className="ml-3" onClick={startWizard}>Retry</Button>
              </div>
            )}
            {generateQuestions.isSuccess && generateQuestions.data && (
              <div className="space-y-4">
                {generateQuestions.data.questions.map((q) => (
                  <div key={q.id}>
                    {q.context && (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 mb-2 leading-relaxed">{q.context}</p>
                    )}
                    <p className="text-sm font-semibold text-gray-800 mb-2">{q.question}</p>
                    <div className="space-y-1.5 ml-1">
                      {q.options.map((opt) => (
                        <label
                          key={opt.value}
                          className={clsx(
                            'flex items-start gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors',
                            answers[q.id] === opt.value ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-gray-100 text-gray-700',
                          )}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt.value}
                            checked={answers[q.id] === opt.value}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                            className="text-indigo-600 focus:ring-indigo-500 mt-0.5"
                          />
                          <div>
                            <span className="font-medium">{opt.label}</span>
                            {opt.description && (
                              <span className="text-gray-500 ml-1">— {opt.description}</span>
                            )}
                          </div>
                        </label>
                      ))}
                      <label
                        className={clsx(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors',
                          answers[q.id] === '__other__' ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-gray-100 text-gray-700',
                        )}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          value="__other__"
                          checked={answers[q.id] === '__other__'}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: '__other__' }))}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Other
                      </label>
                      {answers[q.id] === '__other__' && (
                        <input
                          type="text"
                          value={otherTexts[q.id] || ''}
                          onChange={(e) => setOtherTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Type your answer..."
                          className="ml-7 w-[calc(100%-1.75rem)] px-3 py-1.5 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      )}
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-indigo-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Anything else to consider? <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Additional goals, constraints, context, or feedback for the AI to consider..."
                    className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    onClick={submitAnswers}
                    disabled={generateQuestions.data.questions.some(
                      (q) => !answers[q.id] || (answers[q.id] === '__other__' && !otherTexts[q.id]?.trim()),
                    )}
                  >
                    Generate Suggestion
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Suggestion diff */}
        {wizardStep === 'suggest' && (
          <div>
            {generateSuggestion.isPending && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Spinner className="w-4 h-4" />
                Generating first principles suggestion...
              </div>
            )}
            {generateSuggestion.isError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {(generateSuggestion.error as Error)?.message || 'Failed to generate suggestion'}
                <Button size="sm" variant="secondary" className="ml-3" onClick={() => setWizardStep('questions')}>
                  Back to Questions
                </Button>
              </div>
            )}
            {generateSuggestion.isSuccess && generateSuggestion.data && (
              <div>
                <div className="bg-gray-900 rounded-lg p-4 mb-4 overflow-x-auto font-mono text-xs leading-relaxed max-h-[400px] overflow-y-auto">
                  {generateSuggestion.data.diff_lines.map((line, i) => (
                    <div
                      key={i}
                      className={clsx(
                        'whitespace-pre-wrap',
                        line.type === 'add' && 'text-green-400 bg-green-900/30',
                        line.type === 'remove' && 'text-red-400 bg-red-900/30',
                        line.type === 'context' && 'text-gray-400',
                      )}
                    >
                      <span className="select-none mr-2 text-gray-600">
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                      </span>
                      {line.text}
                    </div>
                  ))}
                </div>
                <details className="mb-4">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                    Preview rendered result
                  </summary>
                  <div className="mt-2 prose prose-sm prose-indigo max-w-none border border-indigo-200 rounded-lg p-3">
                    <Markdown>{generateSuggestion.data.suggested}</Markdown>
                  </div>
                </details>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={closeWizard}>Decline</Button>
                  <Button size="sm" onClick={acceptSuggestion} loading={updateTopic.isPending}>Accept</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- DISPLAY MODE ---
  if (!firstPrinciples && !canEdit) return null;

  return (
    <div className="mb-6 bg-indigo-50/50 border border-indigo-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5">
          First Principles
          <InfoTip text="Human-defined guiding beliefs and success criteria for this topic. These are the highest-authority reference — they override all AI-generated content including plans and research." />
        </h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Tooltip content="Answer a few questions and AI will draft first principles for you. You can edit the result before saving.">
              <button onClick={startWizard} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                AI Wizard
              </button>
            </Tooltip>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => { setDraft(firstPrinciples || ''); setEditing(true); }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Edit
            </button>
          </div>
        )}
      </div>
      {firstPrinciples ? (
        <div className="prose prose-sm prose-indigo max-w-none">
          <Markdown>{firstPrinciples}</Markdown>
        </div>
      ) : (
        <p className="text-sm text-indigo-400 italic">
          No first principles defined yet. Use the AI Wizard or edit manually.
        </p>
      )}
    </div>
  );
}

function EffortToggle({ value, onChange }: { value: 'standard' | 'deep'; onChange: (v: 'standard' | 'deep') => void }) {
  return (
    <Tooltip content="Controls plan generation depth. Standard: medium reasoning, 32K token limit — faster and cheaper. Deep Think: high reasoning, 128K token limit — significantly more thorough but slower and more expensive.">
      <div className="inline-flex items-center rounded-lg border border-gray-300 text-xs">
        <button
          onClick={() => onChange('standard')}
          className={clsx(
            'px-2.5 py-1 rounded-l-lg transition-colors',
            value === 'standard'
              ? 'bg-cortex-100 text-cortex-700 font-medium'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Standard
        </button>
        <button
          onClick={() => onChange('deep')}
          className={clsx(
            'px-2.5 py-1 rounded-r-lg transition-colors',
            value === 'deep'
              ? 'bg-purple-100 text-purple-700 font-medium'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Deep Think
        </button>
      </div>
    </Tooltip>
  );
}

const CLOSENESS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  NOT_STARTED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not Started' },
  EARLY: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Early' },
  MAKING_PROGRESS: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Making Progress' },
  NEARLY_THERE: { bg: 'bg-green-100', text: 'text-green-700', label: 'Nearly There' },
  ACHIEVED: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Achieved' },
  BLOCKED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Blocked' },
};

function ClosenessBadge({ closeness }: { closeness: string }) {
  const style = CLOSENESS_STYLES[closeness] || CLOSENESS_STYLES.NOT_STARTED;
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', style.bg, style.text)}>
      {closeness === 'ACHIEVED' && (
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      {style.label}
    </span>
  );
}

function ScorecardCard({ topicId, hasFirstPrinciples }: { topicId: string; hasFirstPrinciples: boolean }) {
  const { data: scorecardJob, isLoading, isError } = useLatestScorecard(topicId);
  const generate = useGenerateScorecard();

  // Clear stale mutation errors on mount/topicId change
  useEffect(() => {
    generate.reset();
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't show anything if no first principles to score against
  if (!hasFirstPrinciples) return null;

  if (isLoading) return null;

  // No scorecard yet
  if (isError || !scorecardJob) {
    return (
      <Card className="mb-4">
        <CardBody>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            Progress Scorecard
            <InfoTip text="AI evaluates your topic's progress against each success criterion defined in First Principles. Shows how close each criterion is to being met (Not Started through Achieved). Auto-refreshes after research and plan generation." />
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            See a plain-language summary of how close you are to your success criteria.
          </p>
          <Button
            size="sm"
            onClick={() => {
              generate.reset();
              generate.mutate({ topic_id: topicId });
            }}
            loading={generate.isPending}
          >
            {generate.isPending ? 'Evaluating progress...' : 'Generate Scorecard'}
          </Button>
          {generate.isError && (
            <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              <p className="flex-1">{(generate.error as Error)?.message || 'Failed to generate scorecard'}</p>
              <button onClick={() => generate.reset()} className="text-red-400 hover:text-red-600 text-xs font-medium shrink-0">dismiss</button>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  // Have a scorecard
  const scorecard = (scorecardJob.output as any)?.scorecard as ScorecardOutput | undefined;
  if (!scorecard?.criteria) return null;

  const updatedAt = scorecardJob.completed_at || scorecardJob.created_at;

  return (
    <Card className="mb-4">
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            Progress Scorecard
            <InfoTip text="AI evaluates your progress against each success criterion from First Principles. Auto-refreshes after research and plan generation." />
          </h3>
          <div className="flex items-center gap-2">
            {updatedAt && (
              <span className="text-xs text-gray-400">
                {relativeTime(updatedAt)}
              </span>
            )}
            <button
              onClick={() => {
                generate.reset();
                generate.mutate({ topic_id: topicId });
              }}
              disabled={generate.isPending}
              className="text-xs text-cortex-600 hover:text-cortex-800 font-medium disabled:opacity-50"
            >
              {generate.isPending ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Bottom Line — practical takeaway */}
        {scorecard.bottom_line && (
          <div className="mb-4 bg-cortex-50 border border-cortex-200 rounded-lg px-4 py-3">
            <h4 className="text-xs font-semibold text-cortex-700 uppercase tracking-wide mb-1">Bottom Line</h4>
            <p className="text-sm text-gray-800 leading-relaxed">{scorecard.bottom_line}</p>
          </div>
        )}

        {/* Practical Wins — validated findings you can use now */}
        {scorecard.practical_wins?.length > 0 && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
              Practical Wins — What You Can Use Now
            </h4>
            <div className="space-y-3">
              {scorecard.practical_wins.map((win: PracticalWin, i: number) => (
                <div key={i} className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-800">{win.win}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      win.confidence === 'high' ? 'bg-green-100 text-green-700' :
                      win.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{win.confidence}</span>
                  </div>
                  <ul className="ml-4 space-y-0.5 text-gray-600">
                    {win.how_to_use.map((step: string, j: number) => (
                      <li key={j} className="list-disc">{step}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {scorecard.criteria.map((c: ScorecardCriterion, i: number) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-800">{c.name}</span>
                  <ClosenessBadge closeness={c.closeness} />
                </div>
                <p className="text-sm text-gray-600">{c.assessment}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Overall */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-800">Overall</span>
            <ClosenessBadge closeness={scorecard.overall.closeness} />
          </div>
          <p className="text-sm text-gray-600">{scorecard.overall.assessment}</p>
        </div>

        {/* Delta note */}
        {scorecard.delta_note && (
          <p className="mt-2 text-xs text-gray-400 italic">{scorecard.delta_note}</p>
        )}

        {generate.isError && (
          <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <p className="flex-1">{(generate.error as Error)?.message || 'Refresh failed'}</p>
            <button onClick={() => generate.reset()} className="text-red-400 hover:text-red-600 text-xs font-medium shrink-0">dismiss</button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function PipelineStepper({ stage }: { stage: PipelineStage }) {
  const steps = [
    { key: 'discovering', label: 'Discovery', estimate: '~5-8 min' },
    { key: 'synthesizing', label: 'Synthesis', estimate: '~3-5 min' },
    { key: 'planning', label: 'Plan', estimate: '~2-5 min' },
    { key: 'scoring', label: 'Scorecard', estimate: '~15 sec' },
  ];
  const stageOrder = ['discovering', 'synthesizing', 'planning', 'scoring', 'done'];
  const currentIdx = stageOrder.indexOf(stage);

  return (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((step, i) => {
        const isActive = step.key === stage;
        const isCompleted = currentIdx > i;
        return (
          <div key={step.key} className="flex items-center gap-1.5 flex-1">
            <div className={clsx(
              'flex-1 h-2 rounded-full transition-all duration-500',
              isCompleted ? 'bg-emerald-500' :
              isActive ? 'bg-emerald-400 animate-pulse' :
              'bg-gray-200'
            )} />
            <span className={clsx(
              'text-xs whitespace-nowrap',
              isActive ? 'text-emerald-700 font-medium' :
              isCompleted ? 'text-emerald-500' :
              'text-gray-400'
            )}>
              {step.label}
              {isActive && <span className="text-gray-400 ml-1">({step.estimate})</span>}
              {isCompleted && ' \u2713'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ResearchModeToggle({ value, onChange }: { value: 'gap-directed' | 'exploratory'; onChange: (v: 'gap-directed' | 'exploratory') => void }) {
  return (
    <Tooltip content="Gap-Directed: focuses research on your specific query, identifies what's known vs. missing, fills gaps. Exploratory: casts a wide net for patterns, cross-domain connections, and creative approaches.">
      <div className="inline-flex items-center rounded-lg border border-gray-300 text-xs">
        <button
          onClick={() => onChange('gap-directed')}
          className={clsx(
            'px-2.5 py-1 rounded-l-lg transition-colors',
            value === 'gap-directed'
              ? 'bg-cortex-100 text-cortex-700 font-medium'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Gap-Directed
        </button>
        <button
          onClick={() => onChange('exploratory')}
          className={clsx(
            'px-2.5 py-1 rounded-r-lg transition-colors',
            value === 'exploratory'
              ? 'bg-emerald-100 text-emerald-700 font-medium'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Exploratory
        </button>
      </div>
    </Tooltip>
  );
}

function PipelineCard({ topicId, lifecycleState = 'exploring' }: { topicId: string; lifecycleState?: TopicLifecycleState }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  // Lifecycle-driven defaults: exploring = broad discovery, converging/concluded = focused gap-filling
  const [mode, setMode] = useState<'gap-directed' | 'exploratory'>(
    lifecycleState === 'exploring' ? 'exploratory' : 'gap-directed'
  );
  const [effort, setEffort] = useState<'standard' | 'deep'>(
    lifecycleState === 'exploring' ? 'deep' : 'standard'
  );
  const [showResearch, setShowResearch] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showConclusion, setShowConclusion] = useState(false);

  const { data: researchJob, isLoading: researchLoading } = useLatestResearch(topicId);
  const { data: planJob, isLoading: planLoading } = useLatestPlan(topicId);
  const { data: conclusionJob } = useLatestConclusion(topicId);
  const research = useResearch();
  const plan = useGeneratePlan();
  const conclusion = useGenerateConclusion();
  const pipeline = usePipelinePolling(topicId);
  const cancelJobs = useCancelTopicJobs();
  const { isAdmin } = useAuthStore();

  // Clear stale mutation errors on mount
  useEffect(() => {
    research.reset();
    plan.reset();
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasData = Boolean(researchJob) || Boolean(planJob);
  const isRunning = pipeline.stage !== 'idle' && pipeline.stage !== 'done' && pipeline.stage !== 'error';
  const isLoading = researchLoading || planLoading;

  // Auto-expand when running or when no data exists
  const effectiveExpanded = expanded || isRunning || !hasData;

  if (isLoading) return null;

  const defaultQuery = mode === 'gap-directed'
    ? 'Identify the gaps between where we are now and our first principles goals. Focus on what\'s missing, what\'s closest to done, and what specific evidence or work would close each gap. Prioritize the gaps that would make this practically usable soonest.'
    : 'What new techniques, innovations, or research could improve this project? Look for cross-domain patterns, creative approaches, and ideas we haven\'t considered.';

  const handleFullCycle = () => {
    pipeline.startFullCycle();
    research.reset();
    const researchQuery = query.trim() || defaultQuery;
    research.mutate(
      { topic_id: topicId, query: researchQuery, mode, auto_plan: true, plan_effort: effort },
      {
        onSuccess: () => pipeline.onResearchComplete(),
        onError: (err) => pipeline.onResearchError(
          (err as any)?.response?.data?.error?.message || (err as Error)?.message || 'Research failed'
        ),
      },
    );
  };

  const handleResearchOnly = () => {
    research.reset();
    const researchQuery = query.trim() || defaultQuery;
    research.mutate({ topic_id: topicId, query: researchQuery, mode });
  };

  const handleRegeneratePlan = () => {
    plan.reset();
    plan.mutate({ topic_id: topicId, effort });
  };

  const handleCancel = () => {
    cancelJobs.mutate({ topic_id: topicId });
    pipeline.reset();
    research.reset();
    plan.reset();
  };

  // Extract data for display
  const researchOutput = researchJob?.output as { content?: string; iterations?: number; tool_calls_total?: number } | null;
  const planOutput = planJob?.output as { content?: string; thread_id?: string } | null;

  // Collapsed status line
  if (!effectiveExpanded && hasData) {
    return (
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 flex-1 min-w-0"
        >
          <ChevronIcon expanded={false} />
          <span className="text-emerald-600">AI Pipeline</span>
          <span className="text-xs font-normal text-gray-400 ml-1 truncate">
            {researchJob && `Research: ${relativeTime(researchJob.created_at)}`}
            {researchJob && planJob && ' \u00b7 '}
            {planJob && `Plan: ${relativeTime(planJob.created_at)}`}
          </span>
        </button>
        <Button
          size="sm"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setExpanded(true); handleFullCycle(); }}
          disabled={isRunning || research.isPending}
          className="shrink-0"
        >
          Run Full Cycle
        </Button>
      </div>
    );
  }

  // Expanded view
  return (
    <Card className="mb-4 border-l-4 border-emerald-400">
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
            AI Pipeline
            <InfoTip text="Runs a multi-stage AI workflow: Discovery (searches for sources) → Synthesis (writes a research report) → Plan (generates a project plan) → Scorecard (evaluates progress). Each stage builds on the previous." />
          </h3>
          {hasData && (
            <button
              onClick={() => { setExpanded(false); pipeline.reset(); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Collapse
            </button>
          )}
        </div>

        {/* Progress stepper — visible during full cycle */}
        {isRunning && <PipelineStepper stage={pipeline.stage} />}

        {/* Pipeline done message */}
        {pipeline.stage === 'done' && (
          <div className="mb-3 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            <span className="font-medium">Full cycle complete!</span>
            <span className="text-xs text-gray-500">Research, plan, and scorecard updated.</span>
            <button onClick={() => pipeline.reset()} className="ml-auto text-xs text-emerald-500 hover:text-emerald-700">dismiss</button>
          </div>
        )}

        {/* Pipeline error */}
        {pipeline.stage === 'error' && pipeline.error && (
          <div className="mb-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <p className="flex-1">{pipeline.error}</p>
            <button onClick={() => pipeline.reset()} className="text-red-400 hover:text-red-600 text-xs font-medium shrink-0">dismiss</button>
          </div>
        )}

        {/* Research query input */}
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 outline-none"
          rows={2}
          placeholder={defaultQuery}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isRunning}
        />

        {/* Toggles row */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <ResearchModeToggle value={mode} onChange={setMode} />
          <EffortToggle value={effort} onChange={setEffort} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {isRunning ? (
            <>
              <Button
                size="sm"
                loading
                disabled
              >
                {pipeline.stage === 'discovering' ? 'Discovering...' :
                 pipeline.stage === 'synthesizing' ? 'Synthesizing...' :
                 pipeline.stage === 'planning' ? 'Planning...' :
                 pipeline.stage === 'scoring' ? 'Scoring...' :
                 'Running...'}
              </Button>
              <button
                onClick={handleCancel}
                disabled={cancelJobs.isPending}
                className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40"
              >
                {cancelJobs.isPending ? 'Cancelling...' : 'Cancel'}
              </button>
            </>
          ) : (
            <>
              <Tooltip content="Runs the full pipeline: Research → Plan → Scorecard. Takes 10-20 minutes depending on topic complexity.">
                <Button
                  size="sm"
                  onClick={handleFullCycle}
                  disabled={research.isPending}
                >
                  Run Full Cycle
                </Button>
              </Tooltip>
              <Tooltip content="Runs only the research stage (Discovery + Synthesis) without generating a plan or scorecard afterward.">
                <button
                  onClick={handleResearchOnly}
                  disabled={research.isPending}
                  className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                >
                  Research Only
                </button>
              </Tooltip>
              <Tooltip content={!researchJob ? 'Run research first — the plan is based on research output.' : 'Re-generates the project plan using the latest research. Does not re-run research.'}>
                <button
                  onClick={handleRegeneratePlan}
                  disabled={plan.isPending || !researchJob}
                  className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                >
                  {plan.isPending ? 'Planning...' : 'Regenerate Plan'}
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {/* Standalone research pending/error */}
        {research.isPending && !isRunning && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-xs text-gray-400 animate-pulse flex-1">
              Researching... this may take 5-10 minutes.
            </p>
            <button
              onClick={handleCancel}
              disabled={cancelJobs.isPending}
              className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        )}
        {research.isError && !isRunning && (
          <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <p className="flex-1">
              Research failed: {(research.error as any)?.response?.data?.error?.message || (research.error as Error)?.message || 'Unknown error'}
            </p>
            <button onClick={() => research.reset()} className="text-red-400 hover:text-red-600 text-xs font-medium shrink-0">dismiss</button>
          </div>
        )}
        {plan.isError && (
          <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <p className="flex-1">Plan failed: {(plan.error as Error)?.message || 'Unknown error'}</p>
            <button onClick={() => plan.reset()} className="text-red-400 hover:text-red-600 text-xs font-medium shrink-0">dismiss</button>
          </div>
        )}

        {/* Research content (collapsible sub-section) */}
        {researchJob && (
          <div className="mt-4 border-t pt-3">
            <button
              onClick={() => setShowResearch(!showResearch)}
              className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-800"
            >
              <ChevronIcon expanded={showResearch} />
              Research Report
              <span className="text-xs text-gray-400 font-normal">
                {relativeTime(researchJob.created_at)}
                {researchOutput?.tool_calls_total ? ` \u00b7 ${researchOutput.tool_calls_total} tool calls` : ''}
              </span>
            </button>
            {showResearch && researchOutput?.content && (
              <div className="mt-2 max-h-[600px] overflow-y-auto prose prose-sm border-l-4 border-emerald-200 pl-3">
                <Markdown>{researchOutput.content}</Markdown>
              </div>
            )}
          </div>
        )}

        {/* Plan content (collapsible sub-section) */}
        {planJob && (
          <div className="mt-4 border-t pt-3">
            <button
              onClick={() => setShowPlan(!showPlan)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <ChevronIcon expanded={showPlan} />
              Project Plan
              <span className="text-xs text-gray-400 font-normal">
                {relativeTime(planJob.created_at)}
              </span>
              {planOutput?.thread_id && (
                <Link
                  to={`/threads/${planOutput.thread_id}`}
                  className="text-xs text-cortex-600 hover:text-cortex-800 underline font-medium ml-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Thread
                </Link>
              )}
            </button>
            {showPlan && planOutput?.content && (
              <div className="mt-2 max-h-[600px] overflow-y-auto prose prose-sm pl-3">
                <Markdown>{planOutput.content}</Markdown>
              </div>
            )}
          </div>
        )}

        {/* Conclusion section */}
        {conclusionJob && (
          <div className="mt-4 border-t pt-3">
            <button
              onClick={() => setShowConclusion(!showConclusion)}
              className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-800"
            >
              <ChevronIcon expanded={showConclusion} />
              Conclusion
              <span className="text-xs text-gray-400 font-normal">
                {relativeTime(conclusionJob.created_at)}
              </span>
            </button>
            {showConclusion && (conclusionJob.output as any)?.content && (
              <div className="mt-2 max-h-[600px] overflow-y-auto prose prose-sm border-l-4 border-green-200 pl-3">
                <Markdown>{(conclusionJob.output as any).content}</Markdown>
              </div>
            )}
          </div>
        )}

        {/* Generate Conclusion button */}
        {isAdmin() && !conclusion.isPending && (
          <div className="mt-4 border-t pt-3">
            <Tooltip content={!researchJob ? 'Run research first — the conclusion synthesizes all accumulated research, plans, and artifacts.' : 'AI synthesizes all research, plans, and artifacts into a practical playbook with key conclusions, what worked, what failed, and next steps. Marks the topic as Concluded.'}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => conclusion.mutate({ topic_id: topicId })}
                disabled={conclusion.isPending || !researchJob}
              >
                {conclusionJob ? 'Regenerate Conclusion' : 'Generate Conclusion'}
              </Button>
            </Tooltip>
            {conclusion.isPending && (
              <span className="ml-2 text-xs text-gray-400 animate-pulse">Generating conclusion...</span>
            )}
            {conclusion.isError && (
              <p className="mt-1 text-xs text-red-500">
                {(conclusion.error as Error)?.message || 'Conclusion generation failed'}
              </p>
            )}
          </div>
        )}
        {conclusion.isPending && (
          <div className="mt-3 flex items-center gap-2">
            <Spinner />
            <span className="text-xs text-gray-400 animate-pulse">Generating conclusion... this may take a few minutes.</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const LIFECYCLE_COLORS: Record<TopicLifecycleState, string> = {
  exploring: 'bg-blue-100 text-blue-700',
  converging: 'bg-amber-100 text-amber-700',
  concluded: 'bg-green-100 text-green-700',
};

const LIFECYCLE_TOOLTIPS: Record<TopicLifecycleState, string> = {
  exploring: 'Exploring: actively researching, experimenting, and gathering knowledge. No conclusions yet.',
  converging: 'Converging: approaching conclusions. Most success criteria are nearly met. Focus on validation and filling remaining gaps.',
  concluded: 'Concluded: this topic has reached its conclusions. A conclusion artifact summarizes the findings and next steps.',
};

function LifecycleBadge({ state }: { state: TopicLifecycleState }) {
  return (
    <Tooltip content={LIFECYCLE_TOOLTIPS[state]}>
      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full capitalize cursor-help', LIFECYCLE_COLORS[state])}>
        {state}
      </span>
    </Tooltip>
  );
}

function LifecycleControls({ topicId, currentState, settings }: {
  topicId: string;
  currentState: TopicLifecycleState;
  settings?: Record<string, unknown>;
}) {
  const updateTopic = useUpdateTopic();
  const autoConverge = Boolean(settings?.auto_converge);

  return (
    <div className="flex items-center gap-3">
      {/* Lifecycle state selector */}
      <Tooltip content="Set the topic's lifecycle stage. Exploring = active research. Converging = nearing conclusions. Concluded = terminal state with a conclusion artifact.">
        <select
          value={currentState}
          onChange={(e) => updateTopic.mutate({
            id: topicId,
            lifecycle_state: e.target.value as TopicLifecycleState,
          })}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white cursor-pointer"
          disabled={updateTopic.isPending}
        >
          <option value="exploring">Exploring</option>
          <option value="converging">Converging</option>
          <option value="concluded">Concluded</option>
        </select>
      </Tooltip>

      {/* Auto-converge toggle */}
      <Tooltip content="Enabled by default on new topics. After each scorecard, automatically transitions from Exploring to Converging if >=50% of success criteria are Nearly There or Achieved. One-way nudge only — does not auto-conclude. Uncheck to disable.">
        <label className="flex items-center gap-1.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={autoConverge}
            onChange={(e) => updateTopic.mutate({
              id: topicId,
              settings: { ...settings, auto_converge: e.target.checked },
            })}
            className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
            disabled={updateTopic.isPending}
          />
          <span className="text-xs text-gray-500 group-hover:text-gray-700">Auto-converge</span>
        </label>
      </Tooltip>
    </div>
  );
}

export function Topic() {
  const { id } = useParams<{ id: string }>();
  usePageView('topic', { topic_id: id });
  const [activeTab, setActiveTab] = useState<Tab>('threads');
  const [showResolved, setShowResolved] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data: topic, isLoading: topicLoading } = useTopic(id!);
  const { data: threadsData, isLoading: threadsLoading } = useThreads({
    topicId: id,
    limit: 50,
  });
  const { data: artifactsData, isLoading: artifactsLoading } = useArtifacts({
    topicId: id,
    limit: 20,
  });

  const { isContributor, isAdmin } = useAuthStore();
  const createThread = useCreateThread();
  const createArtifact = useCreateArtifact();
  const updateTopic = useUpdateTopic();
  const [showNewThread, setShowNewThread] = useState(false);
  const [showNewArtifact, setShowNewArtifact] = useState(false);
  const [threadForm, setThreadForm] = useState({ title: '', type: 'discussion', body: '', tags: '' });
  const [artifactForm, setArtifactForm] = useState({ title: '', type: 'document', body: '', summary: '', tags: '' });

  if (topicLoading) {
    return <LoadingState message="Loading topic..." />;
  }

  if (!topic) {
    return (
      <EmptyState
        title="Topic not found"
        description="The topic you're looking for doesn't exist."
        icon={<EmptyIcon />}
      />
    );
  }

  const threads = threadsData?.data || [];
  const artifacts = artifactsData?.data || [];

  // Group threads by status
  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');
  const archivedThreads = threads.filter(t => t.status === 'archived');

  const handleCreateThread = (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadForm.title.trim()) return;
    createThread.mutate({
      topic_id: id!,
      title: threadForm.title,
      type: threadForm.type as 'discussion' | 'question' | 'decision' | 'incident',
      body: threadForm.body || undefined,
      tags: threadForm.tags ? threadForm.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    }, {
      onSuccess: () => {
        setShowNewThread(false);
        setThreadForm({ title: '', type: 'discussion', body: '', tags: '' });
      },
    });
  };

  const handleCreateArtifact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!artifactForm.title.trim() || !artifactForm.body.trim()) return;
    createArtifact.mutate({
      topic_id: id!,
      title: artifactForm.title,
      type: artifactForm.type as 'document' | 'decision' | 'procedure' | 'glossary',
      body: artifactForm.body,
      summary: artifactForm.summary || undefined,
      tags: artifactForm.tags ? artifactForm.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    }, {
      onSuccess: () => {
        setShowNewArtifact(false);
        setArtifactForm({ title: '', type: 'document', body: '', summary: '', tags: '' });
      },
    });
  };

  const renderThreadCard = (thread: typeof threads[0], muted: boolean = false) => (
    <Link key={thread.id} to={`/threads/${thread.id}`}>
      <Card hover className={clsx('border-l-4', getTypeBorderColor(thread.type))}>
        <CardBody>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusDot status={thread.status} />
                <Badge variant={getTypeVariant(thread.type)}>
                  {thread.type}
                </Badge>
                <Badge variant={getStatusVariant(thread.status)}>
                  {thread.status}
                </Badge>
              </div>
              <h3 className={clsx(
                'truncate',
                muted ? 'font-normal text-gray-500' : 'font-semibold text-gray-900'
              )}>
                {thread.title}
              </h3>
              {thread.summary && (
                <p className={clsx('text-sm line-clamp-2 mt-1', muted ? 'text-gray-400' : 'text-gray-500')}>
                  {thread.summary}
                </p>
              )}
              <p className={clsx('text-sm mt-1', muted ? 'text-gray-400' : 'text-gray-500')}>
                {thread.creator.display_name} · {relativeTime(thread.updated_at)}
              </p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <span>{thread.comment_count} comments</span>
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  );

  const renderArtifactCard = (artifact: typeof artifacts[0]) => (
    <Link key={artifact.id} to={`/artifacts/${artifact.id}`}>
      <Card hover className={clsx('border-l-4', getTypeBorderColor(artifact.type))}>
        <CardBody>
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusDot status={artifact.status} />
                <Badge variant={getTypeVariant(artifact.type)}>
                  {artifact.type}
                </Badge>
              </div>
              <h3 className="font-medium text-gray-900 truncate">
                {artifact.title}
              </h3>
              {artifact.summary && (
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                  {artifact.summary}
                </p>
              )}
              <p className="text-sm text-gray-500 mt-2">
                {artifact.creator.display_name} · {relativeTime(artifact.created_at)}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  );

  return (
    <div>
      {/* Topic header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {topic.icon ? (
            <span className="text-3xl">{topic.icon}</span>
          ) : (
            <div className="w-12 h-12 bg-cortex-100 rounded-xl flex items-center justify-center">
              <span className="text-cortex-700 font-bold text-xl">
                {topic.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{topic.name}</h1>
              <LifecycleBadge state={(topic as any).lifecycle_state || 'exploring'} />
            </div>
            <p className="text-sm text-gray-500">{topic.handle}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          {topic.description && (
            <p className="text-gray-600 flex-1">{topic.description}</p>
          )}
          {isAdmin() && (
            <LifecycleControls
              topicId={topic.id}
              currentState={(topic as any).lifecycle_state || 'exploring'}
              settings={(topic as any).settings}
            />
          )}
        </div>
      </div>

      {/* First Principles */}
      <FirstPrinciplesSection
        topicId={topic.id}
        firstPrinciples={topic.first_principles}
        canEdit={isAdmin()}
      />

      {/* Progress Scorecard + AI Pipeline */}
      {!topic.archived_at && (
        <>
          <ScorecardCard topicId={topic.id} hasFirstPrinciples={!!topic.first_principles} />
          <PipelineCard topicId={topic.id} lifecycleState={(topic as any).lifecycle_state || 'exploring'} />
        </>
      )}

      {/* Archived banner */}
      {topic.archived_at && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-800">
            This topic is archived. Content is hidden from agent search and discovery.
          </p>
          {isAdmin() && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateTopic.mutate({ id: topic.id, archived: false })}
              loading={updateTopic.isPending}
            >
              Unarchive
            </Button>
          )}
        </div>
      )}

      {/* Creation buttons */}
      {isContributor() && !topic.archived_at && (
        <div className="flex gap-2 mb-4">
          <Button size="sm" onClick={() => setShowNewThread(!showNewThread)}>
            New Thread
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowNewArtifact(!showNewArtifact)}>
            New Artifact
          </Button>
          {isAdmin() && (
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto text-gray-500"
              onClick={() => {
                if (window.confirm('Archive this topic? Its content will be hidden from agent search and discovery.')) {
                  updateTopic.mutate({ id: topic.id, archived: true });
                }
              }}
              loading={updateTopic.isPending}
            >
              Archive
            </Button>
          )}
        </div>
      )}

      {/* Session Briefing */}
      <BriefingCard topicId={id!} />

      {/* AI Actions */}
      <AiActionsPanel
        topicId={id!}
        artifactCount={artifacts.length}
        resolvedThreadCount={threads.filter(t => t.status === 'resolved').length}
        onSwitchToArtifacts={() => setActiveTab('artifacts')}
      />

      {/* New Thread form */}
      {showNewThread && (
        <Card className="mb-4">
          <CardBody>
            <form onSubmit={handleCreateThread}>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Create Thread</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={threadForm.title}
                  onChange={(e) => setThreadForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Thread title *"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                />
                <select
                  value={threadForm.type}
                  onChange={(e) => setThreadForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                >
                  <option value="discussion">Discussion</option>
                  <option value="question">Question</option>
                  <option value="decision">Decision</option>
                  <option value="incident">Incident</option>
                </select>
                <textarea
                  value={threadForm.body}
                  onChange={(e) => setThreadForm(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Body (optional, supports markdown)"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm resize-none"
                />
                <input
                  type="text"
                  value={threadForm.tags}
                  onChange={(e) => setThreadForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="Tags (comma-separated)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewThread(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={createThread.isPending} disabled={!threadForm.title.trim()}>
                    Create Thread
                  </Button>
                </div>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* New Artifact form */}
      {showNewArtifact && (
        <Card className="mb-4">
          <CardBody>
            <form onSubmit={handleCreateArtifact}>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Create Artifact</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={artifactForm.title}
                  onChange={(e) => setArtifactForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Artifact title *"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                />
                <select
                  value={artifactForm.type}
                  onChange={(e) => setArtifactForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                >
                  <option value="document">Document</option>
                  <option value="decision">Decision</option>
                  <option value="procedure">Procedure</option>
                  <option value="glossary">Glossary</option>
                </select>
                <input
                  type="text"
                  value={artifactForm.summary}
                  onChange={(e) => setArtifactForm(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="Summary (recommended)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                />
                <textarea
                  value={artifactForm.body}
                  onChange={(e) => setArtifactForm(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Body content * (supports markdown)"
                  rows={6}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm resize-none"
                />
                <input
                  type="text"
                  value={artifactForm.tags}
                  onChange={(e) => setArtifactForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="Tags (comma-separated)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewArtifact(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={createArtifact.isPending} disabled={!artifactForm.title.trim() || !artifactForm.body.trim()}>
                    Create Artifact
                  </Button>
                </div>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-8">
          <button
            onClick={() => setActiveTab('threads')}
            className={clsx(
              'pb-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'threads'
                ? 'border-cortex-600 text-cortex-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            Threads ({threads.length})
          </button>
          <button
            onClick={() => setActiveTab('artifacts')}
            className={clsx(
              'pb-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'artifacts'
                ? 'border-cortex-600 text-cortex-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            Artifacts ({artifacts.length})
          </button>
        </div>
      </div>

      {/* Threads tab — grouped by status */}
      {activeTab === 'threads' && (
        <div>
          {threadsLoading ? (
            <LoadingState message="Loading threads..." />
          ) : threads.length === 0 ? (
            <EmptyState
              title="No threads yet"
              description="Start a discussion in this topic."
              icon={<EmptyIcon />}
            />
          ) : (
            <div className="space-y-6">
              {/* Open threads — always visible, prominent */}
              {openThreads.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <StatusDot status="open" />
                    Open ({openThreads.length})
                  </h3>
                  <div className="space-y-2">
                    {openThreads.map(t => renderThreadCard(t, false))}
                  </div>
                </div>
              )}

              {/* Resolved threads — collapsed by default, muted */}
              {resolvedThreads.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowResolved(!showResolved)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 mb-2"
                  >
                    <ChevronIcon expanded={showResolved} />
                    <StatusDot status="resolved" />
                    Resolved ({resolvedThreads.length})
                  </button>
                  {showResolved && (
                    <div className="space-y-2">
                      {resolvedThreads.map(t => renderThreadCard(t, true))}
                    </div>
                  )}
                </div>
              )}

              {/* Archived threads — collapsed by default, most muted */}
              {archivedThreads.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 mb-2"
                  >
                    <ChevronIcon expanded={showArchived} />
                    <StatusDot status="archived" />
                    Archived ({archivedThreads.length})
                  </button>
                  {showArchived && (
                    <div className="space-y-2">
                      {archivedThreads.map(t => renderThreadCard(t, true))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Artifacts tab */}
      {activeTab === 'artifacts' && (
        <div>
          {artifactsLoading ? (
            <LoadingState message="Loading artifacts..." />
          ) : artifacts.length === 0 ? (
            <EmptyState
              title="No artifacts yet"
              description="Artifacts document decisions, procedures, and knowledge."
              icon={<EmptyIcon />}
            />
          ) : (
            <div className="space-y-2">
              {artifacts.map(artifact => renderArtifactCard(artifact))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
