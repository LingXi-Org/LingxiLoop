import { useEffect, useMemo, useState } from "react";
import type {
  LearningActivity,
  LearningCourse,
  LearningDashboard,
  LearningDelivery,
  LearningEvidence,
  LearningMission,
  LearningNotificationPreferences,
  LearningObjective,
  LearningProgress,
  LearningReview,
  TeacherAgentSummary,
} from "@/api/contracts";
import { learningApi } from "@/api/learning";
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { useApp } from "@/stores/app";
import { useConversations } from "@/features/conversations/store";
import { useParticipants } from "@/stores/participants";
type Section =
  | "today"
  | "objectives"
  | "activities"
  | "evidence"
  | "reviews"
  | "notifications";

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  active: "进行中",
  published: "已发布",
  closed: "已关闭",
  archived: "已归档",
  open: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
  pending: "待审核",
  accepted: "已采纳",
  rejected: "已退回",
  verified: "已验证",
  learning: "学习中",
  needs_review: "待复核",
  sent: "已送达",
  failed: "投递失败",
};
const MISSION_KIND_LABELS: Record<string, string> = {
  study: "持续学习",
  project: "迁移项目",
  research: "资料研读",
  review: "复习巩固",
};
const STEP_TYPE_LABELS: Record<string, string> = {
  learn: "理解",
  practice: "练习",
  check: "检查",
  reflect: "反思",
};
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  lesson: "课程讲解",
  practice: "练习",
  assessment: "考核",
  project: "项目",
  review: "复习",
};
const EVALUATION_MODE_LABELS: Record<string, string> = {
  agent_formative: "智能体形成性评价",
  teacher_required: "教师审核",
};
const WEEKDAY_LABELS: Record<string, string> = {
  monday: "周一",
  tuesday: "周二",
  wednesday: "周三",
  thursday: "周四",
  friday: "周五",
  saturday: "周六",
  sunday: "周日",
};
const ASSISTANCE_LABELS: Record<string, string> = {
  none: "独立完成",
  hint: "使用提示",
  guided: "引导下完成",
};
const DELIVERY_CHANNEL_LABELS: Record<string, string> = {
  in_app: "应用内",
  email: "邮件",
};

function statusLabel(value: unknown): string {
  const raw = String(value ?? "—");
  return STATUS_LABELS[raw] ?? raw;
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-hairline bg-card p-4 shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

function MasteryBadge({ level }: { level: number }) {
  const labels = [
    "尚无证据",
    "识别 / 回忆",
    "提示下完成",
    "独立完成",
    "迁移应用",
  ];
  return (
    <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
      L{level} · {labels[level] ?? labels[0]}
    </span>
  );
}

function Onboarding({ onCreated }: { onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState("我的学习课程");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  );
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const course = await learningApi.createCourse({ name: title });
      await learningApi.setNotificationPreferences({
        courseId: course.id,
        timezone,
        preferredTime: "19:00",
        quietStart,
        quietEnd,
        inAppEnabled: true,
        emailEnabled: false,
      });
      await onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-3xl items-center px-5 py-10">
      <Card className="w-full p-6 md:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
          学习中心
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">
          建立你的第一个课程空间
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-ink-secondary">
          课程把学习目标、学习室、练习证据与掌握度连成一个闭环。教学智能体
          可以协助规划并开展形成性评价，发布内容与确认高阶掌握仍由教师负责。
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="grid gap-2 text-[12px] font-semibold text-ink md:col-span-2">
            课程名称
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 rounded-xl border border-hairline bg-panel px-3 text-[13px]"
            />
          </label>
          <label className="grid gap-2 text-[12px] font-semibold text-ink md:col-span-2">
            时区
            <Input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="h-10 rounded-xl border border-hairline bg-panel px-3 text-[13px]"
            />
          </label>
          <label className="grid gap-2 text-[12px] font-semibold text-ink">
            安静时段开始
            <Input
              type="time"
              value={quietStart}
              onChange={(event) => setQuietStart(event.target.value)}
              className="h-10 rounded-xl border border-hairline bg-panel px-3 text-[13px]"
            />
          </label>
          <label className="grid gap-2 text-[12px] font-semibold text-ink">
            安静时段结束
            <Input
              type="time"
              value={quietEnd}
              onChange={(event) => setQuietEnd(event.target.value)}
              className="h-10 rounded-xl border border-hairline bg-panel px-3 text-[13px]"
            />
          </label>
        </div>
        {error && (
          <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-[11px] text-ink-secondary">
            应用内提醒默认开启；邮件可稍后自行订阅。课程会自动创建一对一项目与 Study Room。
          </p>
          <button
            disabled={busy || !title.trim()}
            onClick={() => void create()}
            className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "正在创建…" : "创建课程"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function TeacherComposer({
  course,
  objectives,
  onChanged,
}: {
  course: LearningCourse;
  objectives: LearningObjective[];
  onChanged: () => Promise<void>;
}) {
  const [objectiveTitle, setObjectiveTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <h3 className="text-[14px] font-semibold text-ink">课程成员</h3>
        <p className="mt-2 text-[12px] text-ink-secondary">教师与学习者统一通过 canonical Course 邀请和成员管理维护。</p>
        <button onClick={() => useApp.getState().setView("management")} className="mt-3 rounded-full bg-raised px-4 py-2 text-[12px] font-semibold text-ink">打开课程管理</button>
      </Card>
      <Card>
        <h3 className="text-[14px] font-semibold text-ink">新增学习目标</h3>
        <Input
          value={objectiveTitle}
          onChange={(event) => setObjectiveTitle(event.target.value)}
          placeholder="目标标题"
          className="mt-3 h-10 w-full rounded-xl border border-hairline bg-panel px-3 text-[13px]"
        />
        <Textarea
          value={criteria}
          onChange={(event) => setCriteria(event.target.value)}
          placeholder="可检查的成功标准"
          className="mt-2 min-h-20 w-full rounded-xl border border-hairline bg-panel p-3 text-[13px]"
        />
        <button
          onClick={() =>
            void learningApi
              .createObjectives(course.id, [
                {
                  title: objectiveTitle,
                  successCriteria: criteria,
                  targetLevel: 3,
                },
              ])
              .then(async () => {
                setObjectiveTitle("");
                setCriteria("");
                await onChanged();
              })
              .catch((reason) => setError(String(reason)))
          }
          className="mt-3 rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-white"
        >
          保存目标
        </button>
      </Card>
      <Card>
        <h3 className="text-[14px] font-semibold text-ink">创建活动草稿</h3>
        <Input
          value={activityTitle}
          onChange={(event) => setActivityTitle(event.target.value)}
          placeholder="活动标题"
          className="mt-3 h-10 w-full rounded-xl border border-hairline bg-panel px-3 text-[13px]"
        />
        <Textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="学习者任务说明"
          className="mt-2 min-h-20 w-full rounded-xl border border-hairline bg-panel p-3 text-[13px]"
        />
        <button
          onClick={() =>
            void learningApi
              .createActivity(course.id, {
                title: activityTitle,
                instructions,
                type: "practice",
                evaluationMode: "agent_formative",
                targetLevel: 3,
                rubric: [],
                objectiveIds: objectives[0] ? [objectives[0].id] : [],
              })
              .then(async () => {
                setActivityTitle("");
                setInstructions("");
                await onChanged();
              })
              .catch((reason) => setError(String(reason)))
          }
          className="mt-3 rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-white"
        >
          保存草稿
        </button>
      </Card>
      {error && (
        <p className="text-[12px] text-red-500 xl:col-span-2">{error}</p>
      )}
    </div>
  );
}

export function LearningCenter() {
  const setView=useApp((state)=>state.setView);
  const selectConversation=useApp((state)=>state.selectConversation);
  const participantsById=useParticipants((state)=>state.byId);
  const coordinatorAgents=useMemo(()=>Object.values(participantsById).filter((participant)=>participant.kind==='agent'&&participant.capabilities?.includes('learning')&&participant.capabilities?.includes('canvas')),[participantsById]);
  const [dashboard, setDashboard] = useState<LearningDashboard | null>(null);
  const [courseId, setCourseId] = useState("");
  const [section, setSection] = useState<Section>("today");
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [evidence, setEvidence] = useState<LearningEvidence[]>([]);
  const [missions, setMissions] = useState<LearningMission[]>([]);
  const [reviews, setReviews] = useState<LearningReview[]>([]);
  const [progress, setProgress] = useState<LearningProgress[]>([]);
  const [teacherAgent,setTeacherAgent]=useState<TeacherAgentSummary|null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notificationPrefs, setNotificationPrefs] = useState<LearningNotificationPreferences>({
    course_id: null,
    in_app_enabled: true,
    email_enabled: false,
    timezone: "Asia/Shanghai",
    preferred_time: "19:00",
    quiet_start: null,
    quiet_end: null,
  });
  const [deliveries, setDeliveries] = useState<LearningDelivery[]>([]);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    const next = await learningApi.getDashboard();
    setDashboard(next);
    setCourseId((current) => current || next.courses[0]?.id || "");
  };
  const loadCourse = async (id = courseId) => {
    if (!id) return;
    const [nextObjectives, nextActivities, nextEvidence, nextMissions] =
      await Promise.all([
        learningApi.listObjectives(id),
        learningApi.listActivities(id),
        learningApi.listEvidence(id),
        learningApi.listMissions(id),
      ]);
    setObjectives(nextObjectives);
    setActivities(nextActivities);
    setEvidence(nextEvidence);
    setMissions(nextMissions);
    const [prefs, nextDeliveries] = await Promise.all([
      learningApi.getNotificationPreferences(id),
      learningApi.listDeliveries(),
    ]);
    setNotificationPrefs(prefs);
    setDeliveries(nextDeliveries);
    const current = dashboard?.courses.find((course) => course.id === id);
    if (current?.courseRole === "teacher") {
      const [nextReviews, nextProgress,nextTeacherAgent] = await Promise.all([
        learningApi.listReviews(id),
        learningApi.getCourseProgress(id),
        learningApi.getTeacherAgent(id),
      ]);
      setReviews(nextReviews);
      setProgress(nextProgress);
      setTeacherAgent(nextTeacherAgent);
    }else{
      setReviews([]);
      setProgress([]);
      setTeacherAgent(null);
    }
  };
  useEffect(() => {
    void loadDashboard().catch((reason) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, []);
  useEffect(() => {
    const refresh = () =>
      void loadDashboard()
        .then(() => loadCourse())
        .catch((reason) => setError(String(reason)));
    window.addEventListener("lingxiloop:learning-updated", refresh);
    return () =>
      window.removeEventListener("lingxiloop:learning-updated", refresh);
  }, [courseId]);
  useEffect(() => {
    void loadCourse(courseId).catch((reason) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [courseId, dashboard?.courses.length]);

  const course = dashboard?.courses.find((item) => item.id === courseId);
  const perspective = course?.courseRole ?? "learner";
  useEffect(() => {
    if (
      (perspective === "teacher" && section === "evidence") ||
      (perspective === "learner" && section === "reviews")
    )
      setSection("today");
  }, [perspective, section]);
  const due = useMemo(
    () => dashboard?.due.filter((item) => item.course_id === courseId) ?? [],
    [courseId, dashboard?.due],
  );
  const mastery = useMemo(
    () =>
      new Map(
        (dashboard?.mastery ?? [])
          .filter((item) => item.course_id === courseId)
          .map((item) => [item.objective_id, item.level]),
      ),
    [courseId, dashboard?.mastery],
  );

  if (!dashboard)
    return (
      error
        ? <div className="grid h-full place-items-center text-[13px] text-ink-secondary">{error}</div>
        : <ResourceSkeleton variant="detail" className="h-full" label="正在加载学习中心" />
    );
  if (dashboard.courses.length === 0)
    return <Onboarding onCreated={loadDashboard} />;
  if (!course) return null;

  const sections: Array<[Section, string]> =
    perspective === "teacher"
      ? [
          ["today", "总览"],
          ["objectives", "目标与内容"],
          ["activities", "发布管理"],
          [
            "reviews",
            `评价审核${reviews.length ? ` · ${reviews.length}` : ""}`,
          ],
          ["notifications", "提醒"],
        ]
      : [
          ["today", "今日"],
          ["objectives", "目标图"],
          ["activities", "活动"],
          ["evidence", "掌握证据"],
          ["notifications", "提醒"],
        ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-app text-ink">
      <header className="shrink-0 border-b border-hairline bg-panel px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <div className="min-w-0 basis-full md:basis-auto md:flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
              学习
            </p>
            <h1 className="truncate text-lg font-semibold">{course.title}</h1>
          </div>
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-xl border border-hairline bg-card px-3 text-[12px] md:max-w-52 md:flex-none"
          >
            {dashboard.courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <span className="rounded-full bg-raised px-3 py-1.5 text-[11px] font-semibold text-ink-secondary">
            {course.courseRole === "teacher" ? "教师" : "学习者"}
          </span>
        </div>
        <nav className="mx-auto mt-3 flex max-w-6xl gap-1 overflow-x-auto">
          {sections.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold ${section === key ? "bg-accent text-white" : "text-ink-secondary hover:bg-raised"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto max-w-6xl space-y-4">
          {error && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
              {error}
            </p>
          )}
          {section === "today" && perspective === "learner" && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <p className="text-[11px] text-ink-secondary">到期复习</p>
                  <p className="mt-2 text-3xl font-semibold">{due.length}</p>
                </Card>
                <Card>
                  <p className="text-[11px] text-ink-secondary">目标</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {objectives.length}
                  </p>
                </Card>
                <Card>
                  <p className="text-[11px] text-ink-secondary">已发布活动</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {
                      activities.filter((item) => item.status === "published")
                        .length
                    }
                  </p>
                </Card>
              </div>
              {missions.map((mission) => {
                const steps = mission.steps;
                const completed = steps.filter(
                  (step) => step.status === "completed",
                ).length;
                return (
                  <Card key={String(mission.id)}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold tracking-[0.16em] text-accent">
                          学习任务板
                        </p>
                        <h3 className="mt-1 text-[15px] font-semibold">
                          {String(mission.goal)}
                        </h3>
                        <p className="mt-1 text-[12px] text-ink-secondary">
                          成功标准：{String(mission.successCriteria)}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-ink-secondary">
                          {MISSION_KIND_LABELS[String(mission.missionKind ?? "study")] ?? String(mission.missionKind ?? "study")} · 负责人 {String(mission.coordinatorName ?? mission.coordinatorAgentId ?? "—")}
                        </p>
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent">
                        {statusLabel(mission.status)} · 已完成 {completed}/{steps.length}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2">
                      {steps.map((step) => (
                        <div
                          key={String(step.id)}
                          className="flex items-start gap-3 rounded-xl bg-panel px-3 py-2.5"
                        >
                          <span
                            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${step.status === "completed" ? "bg-emerald-500 text-white" : step.status === "in_progress" ? "bg-accent text-white" : "bg-raised text-ink-secondary"}`}
                          >
                            {step.status === "completed"
                              ? "✓"
                              : String(Number(step.position) + 1)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold">
                              {String(step.description)}
                            </p>
                            <p className="mt-0.5 text-[10px] text-ink-secondary">
                              {STEP_TYPE_LABELS[String(step.type)] ?? String(step.type)} ·{" "}
                              {String(step.successCriteria)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
              {due.map((item) => (
                <Card key={item.objective_id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[14px] font-semibold">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-[12px] text-ink-secondary">
                        今天安排一次短复习；失败会在明天重新进入队列。
                      </p>
                    </div>
                    <MasteryBadge level={item.level} />
                  </div>
                </Card>
              ))}
              {due.length === 0 && (
                <Card>
                  <p className="text-[14px] font-semibold">今天没有到期复习</p>
                  <p className="mt-1 text-[12px] text-ink-secondary">
                    你可以继续一个活动，或在学习室里请 Nova 建立持续学习任务。
                  </p>
                </Card>
              )}
            </>
          )}
          {section === "today" && perspective === "teacher" && (
            <>
              {teacherAgent&&<Card className="overflow-hidden border-accent/25 bg-gradient-to-br from-accent/10 via-card to-card">
                <div className="flex flex-wrap items-start gap-4 md:items-center">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-lg font-bold text-white shadow-sm">P</div>
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">{teacherAgent.displayName}</h3><span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent">教师专用 · 项目内复用</span></div>
                    <p className="mt-1 text-[12px] text-ink-secondary">教学运营与学情汇总 · 仅本课程教师可见，关键变更必须由教师确认</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-ink-secondary"><span className="rounded-full bg-raised px-2 py-1">班级汇总</span><span className="rounded-full bg-raised px-2 py-1">学生钻取</span><span className="rounded-full bg-raised px-2 py-1">关键变更审批</span></div>
                    <p className="mt-2 text-[11px] text-ink-secondary">定时摘要：{teacherAgent.digest.frequency==='off'?'未开启':`${teacherAgent.digest.frequency==='daily'?'每日':`每${WEEKDAY_LABELS[teacherAgent.digest.weekday??'']??'周'}`} ${teacherAgent.digest.localTime??''} · ${teacherAgent.digest.timezone}`}{teacherAgent.digest.nextRunAt?` · 下次发送 ${new Date(teacherAgent.digest.nextRunAt).toLocaleString('zh-CN')}`:''} · 待审批 {teacherAgent.pendingApprovals} 项</p>
                  </div>
                  <button onClick={()=>void useConversations.getState().reload().then(()=>{setView('conversations');selectConversation(teacherAgent.roomId)})} className="w-full whitespace-nowrap rounded-full bg-accent px-4 py-2.5 text-[12px] font-semibold text-white md:w-auto">打开共享教师室</button>
                </div>
              </Card>}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <p className="text-[11px] text-ink-secondary">学习者</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {course.learnerCount}
                  </p>
                </Card>
                <Card>
                  <p className="text-[11px] text-ink-secondary">待审核</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {reviews.length}
                  </p>
                </Card>
                <Card>
                  <p className="text-[11px] text-ink-secondary">课程状态</p>
                  <p className="mt-2 text-xl font-semibold">{statusLabel(course.status)}</p>
                </Card>
              </div>
              {progress.length > 0 && (
                <Card>
                  <h3 className="text-[14px] font-semibold">成员进度</h3>
                  <div className="mt-3 divide-y divide-hairline">
                    {progress.map((item) => (
                      <div
                        key={String(item.user_id)}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <p className="text-[13px] font-semibold">
                            {String(
                              item.display_name ?? item.email ?? item.user_id,
                            )}
                          </p>
                          <p className="text-[11px] text-ink-secondary">
                            {String(item.attempts)} 次尝试 ·{" "}
                            {String(item.due_objectives)} 项到期
                          </p>
                        </div>
                        <MasteryBadge
                          level={Math.round(Number(item.average_level))}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {missions.length>0&&<Card><h3 className="text-[14px] font-semibold">学习任务负责人</h3><p className="mt-1 text-[11px] text-ink-secondary">每项持续学习任务由一名教学智能体负责协调，专业角色仍可在协作画布中分工。</p><div className="mt-3 divide-y divide-hairline">{missions.map((mission)=><div key={String(mission.id)} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-[12px] font-semibold">{String(mission.goal)}</p><p className="mt-1 text-[10px] text-ink-secondary">{MISSION_KIND_LABELS[String(mission.missionKind??'study')]??String(mission.missionKind??'study')} · 当前负责人 {String(mission.coordinatorName??mission.coordinatorAgentId??'—')}</p></div><select aria-label={`调整“${String(mission.goal)}”的负责人`} value={String(mission.coordinatorAgentId??'')} onChange={(event)=>void learningApi.setMissionCoordinator(course.id,String(mission.id),event.target.value).then(()=>loadCourse()).catch((reason)=>setError(String(reason)))} className="h-9 rounded-xl border border-hairline bg-panel px-3 text-[11px]">{coordinatorAgents.map((agent)=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></div>)}</div></Card>}
              <TeacherComposer
                course={course}
                objectives={objectives}
                onChanged={() => loadCourse()}
              />
            </>
          )}
          {section === "objectives" && (
            <div className="space-y-3">
              {objectives.map((objective, index) => (
                <Card key={objective.id}>
                  <div className="flex gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-bold text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-semibold">
                          {objective.title}
                        </h3>
                        {perspective === "learner" && (
                          <MasteryBadge
                            level={mastery.get(objective.id) ?? 0}
                          />
                        )}
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-ink-secondary">
                        成功标准：{objective.successCriteria}
                      </p>
                      <p className="mt-2 text-[10px] text-ink-secondary">
                        目标等级 L{objective.targetLevel} · 先修{" "}
                        {objective.prerequisiteIds.length || "无"} ·{" "}
                        {statusLabel(objective.status)}
                      </p>
                      {perspective === "teacher" &&
                        objective.status === "draft" && (
                          <button
                            onClick={() =>
                              void learningApi
                                .setObjectiveStatus(
                                  course.id,
                                  objective.id,
                                  "published",
                                )
                                .then(() => loadCourse())
                            }
                            className="mt-3 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white"
                          >
                            发布目标
                          </button>
                        )}
                    </div>
                  </div>
                </Card>
              ))}
              {objectives.length === 0 && (
                <Card>
                  <p className="text-[13px] text-ink-secondary">
                    还没有目标。教师或 Nova 可以先创建草稿。
                  </p>
                </Card>
              )}
            </div>
          )}
          {section === "activities" && (
            <div className="space-y-3">
              {activities.map((activity) => (
                <Card key={activity.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold">
                          {activity.title}
                        </h3>
                        <span className="rounded-full bg-raised px-2 py-1 text-[10px] font-semibold text-ink-secondary">
                          {statusLabel(activity.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-5 text-ink-secondary">
                        {activity.instructions}
                      </p>
                      <p className="mt-2 text-[10px] text-ink-secondary">
                        {ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type} · L{activity.targetLevel} ·{" "}
                        {EVALUATION_MODE_LABELS[activity.evaluationMode] ?? activity.evaluationMode}
                      </p>
                    </div>
                    {perspective === "teacher" && (
                      <div className="flex gap-2">
                        {activity.status === "draft" && (
                          <button
                            onClick={() =>
                              void learningApi
                                .publishActivity(course.id, activity.id)
                                .then(() => loadCourse())
                                .catch((reason) => setError(String(reason)))
                            }
                            className="rounded-full bg-accent px-3 py-2 text-[11px] font-semibold text-white"
                          >
                            发布
                          </button>
                        )}
                        {activity.status === "published" && (
                          <button
                            onClick={() =>
                              void learningApi
                                .closeActivity(course.id, activity.id)
                                .then(() => loadCourse())
                                .catch((reason) => setError(String(reason)))
                            }
                            className="rounded-full bg-raised px-3 py-2 text-[11px] font-semibold text-ink"
                          >
                            关闭
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {perspective === "learner" &&
                    activity.status === "published" && (
                      <div className="mt-4">
                        <Textarea
                          value={answers[activity.id] ?? ""}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [activity.id]: event.target.value,
                            }))
                          }
                          placeholder="在这里提交你的作答或反思"
                          className="min-h-24 w-full rounded-xl border border-hairline bg-panel p-3 text-[13px]"
                        />
                        <button
                          onClick={() =>
                            void learningApi
                              .submitActivity(
                                course.id,
                                activity.id,
                                answers[activity.id] ?? "",
                              )
                              .then(async () => {
                                setAnswers((current) => ({
                                  ...current,
                                  [activity.id]: "",
                                }));
                                await loadCourse();
                              })
                              .catch((reason) => setError(String(reason)))
                          }
                          className="mt-2 rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-white"
                        >
                          提交为学习证据
                        </button>
                      </div>
                    )}
                </Card>
              ))}
            </div>
          )}
          {section === "evidence" && (
            <div className="space-y-3">
              {evidence.map((raw, index) => {
                const item = raw;
                return (
                  <Card key={String(item.id ?? index)}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold">
                          尝试 #{evidence.length - index}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-secondary">
                          {new Date(String(item.created_at)).toLocaleString()} ·{" "}
                          {ASSISTANCE_LABELS[String(item.assistance)] ?? String(item.assistance)}
                        </p>
                      </div>
                      {item.demonstrated_level !== null &&
                      item.demonstrated_level !== undefined ? (
                        <MasteryBadge level={Number(item.demonstrated_level)} />
                      ) : (
                        <span className="text-[11px] text-ink-secondary">
                          等待评价
                        </span>
                      )}
                    </div>
                    {item.feedback ? (
                      <p className="mt-3 text-[12px] text-ink-secondary">
                        {String(item.feedback)}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
          {section === "reviews" && (
            <div className="space-y-3">
              {reviews.map((item) => (
                <Card key={String(item.id)}>
                  <h3 className="text-[14px] font-semibold">
                    {String(item.activity_title ?? "学习评价")}
                  </h3>
                  <p className="mt-1 text-[12px] text-ink-secondary">
                    学习者 {String(progress.find((learner)=>learner.user_id===item.learner_id)?.display_name??"课程成员")} · 建议 L
                    {String(item.demonstrated_level)} · 置信度{" "}
                    {Math.round(Number(item.confidence) * 100)}%
                  </p>
                  <p className="mt-2 text-[12px]">
                    {String(item.feedback ?? "")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
                    <span className="rounded-full bg-raised px-2 py-1 text-ink-secondary">评价提交者：{item.builder_agent_id?participantsById[String(item.builder_agent_id)]?.name??"教学智能体":"未绑定"}</span>
                    <span className={`rounded-full px-2 py-1 ${item.verifier_verdict === "supported" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                      独立复核：{item.verifier_agent_id?participantsById[String(item.verifier_agent_id)]?.name??"教学智能体":"尚未复核"} · {item.verifier_verdict==="supported"?"证据支持":item.verifier_verdict==="rejected"?"证据冲突":"需教师审核"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        void learningApi
                          .reviewEvaluation(
                            course.id,
                            String(item.id),
                            {
                              decision: "accept",
                              reason: "教师确认评价与证据一致",
                              ...(Number(item.demonstrated_level) === 4
                                ? { overrideLevel: 4 }
                                : {}),
                            },
                          )
                          .then(() => loadCourse())
                          .catch((reason) => setError(String(reason)))
                      }
                      className="rounded-full bg-accent px-3 py-2 text-[11px] font-semibold text-white"
                    >
                      {Number(item.demonstrated_level) === 4
                        ? "教师确认 L4"
                        : "接受"}
                    </button>
                    <button
                      onClick={() =>
                        void learningApi
                          .reviewEvaluation(
                            course.id,
                            String(item.id),
                            {
                              decision: "reject",
                              reason: "证据不足，需要补充",
                            },
                          )
                          .then(() => loadCourse())
                          .catch((reason) => setError(String(reason)))
                      }
                      className="rounded-full bg-raised px-3 py-2 text-[11px] font-semibold text-ink"
                    >
                      退回
                    </button>
                  </div>
                </Card>
              ))}
              {reviews.length === 0 && (
                <Card>
                  <p className="text-[13px] text-ink-secondary">
                    没有待审核评价。
                  </p>
                </Card>
              )}
            </div>
          )}
          {section === "notifications" && (
            <Card className="max-w-2xl">
              <h3 className="text-[15px] font-semibold">提醒与摘要</h3>
              <p className="mt-1 text-[12px] text-ink-secondary">
                每日聚合发送；通知正文不会包含答案、分数细节或私聊内容。
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["in_app_enabled", "应用内"],
                    ["email_enabled", "邮件"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-hairline bg-panel px-3 py-3 text-[12px] font-semibold"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={notificationPrefs[key] === true}
                      onChange={(event) =>
                        setNotificationPrefs((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                  </label>
                ))}
                <label className="grid gap-2 text-[12px] font-semibold">
                  时区
                  <Input
                    value={String(
                      notificationPrefs.timezone ?? "Asia/Shanghai",
                    )}
                    onChange={(event) =>
                      setNotificationPrefs((current) => ({
                        ...current,
                        timezone: event.target.value,
                      }))
                    }
                    className="h-10 rounded-xl border border-hairline bg-panel px-3"
                  />
                </label>
                <label className="grid gap-2 text-[12px] font-semibold">
                  首选时间
                  <Input
                    type="time"
                    value={String(
                      notificationPrefs.preferred_time ?? "19:00",
                    ).slice(0, 5)}
                    onChange={(event) =>
                      setNotificationPrefs((current) => ({
                        ...current,
                        preferred_time: event.target.value,
                      }))
                    }
                    className="h-10 rounded-xl border border-hairline bg-panel px-3"
                  />
                </label>
                <label className="grid gap-2 text-[12px] font-semibold">
                  安静时段开始
                  <Input
                    type="time"
                    value={String(notificationPrefs.quiet_start ?? "").slice(
                      0,
                      5,
                    )}
                    onChange={(event) =>
                      setNotificationPrefs((current) => ({
                        ...current,
                        quiet_start: event.target.value || null,
                      }))
                    }
                    className="h-10 rounded-xl border border-hairline bg-panel px-3"
                  />
                </label>
                <label className="grid gap-2 text-[12px] font-semibold">
                  安静时段结束
                  <Input
                    type="time"
                    value={String(notificationPrefs.quiet_end ?? "").slice(
                      0,
                      5,
                    )}
                    onChange={(event) =>
                      setNotificationPrefs((current) => ({
                        ...current,
                        quiet_end: event.target.value || null,
                      }))
                    }
                    className="h-10 rounded-xl border border-hairline bg-panel px-3"
                  />
                </label>
              </div>
              <button
                onClick={() =>
                  void learningApi
                    .setNotificationPreferences({
                      courseId: course.id,
                      inAppEnabled: notificationPrefs.in_app_enabled !== false,
                      emailEnabled: notificationPrefs.email_enabled === true,
                      timezone: String(
                        notificationPrefs.timezone ?? "Asia/Shanghai",
                      ),
                      preferredTime: String(
                        notificationPrefs.preferred_time ?? "19:00",
                      ).slice(0, 5),
                      ...(notificationPrefs.quiet_start
                        ? { quietStart: notificationPrefs.quiet_start }
                        : {}),
                      ...(notificationPrefs.quiet_end
                        ? { quietEnd: notificationPrefs.quiet_end }
                        : {}),
                    })
                    .then(setNotificationPrefs)
                    .catch((reason) => setError(String(reason)))
                }
                className="mt-5 rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-white"
              >
                保存提醒偏好
              </button>
              {deliveries.length > 0 && (
                <div className="mt-6 border-t border-hairline pt-4">
                  <h4 className="text-[12px] font-semibold">投递记录</h4>
                  <div className="mt-2 space-y-2">
                    {deliveries.slice(0, 12).map((item) => (
                      <div
                        key={String(item.id)}
                        className="flex items-center justify-between rounded-xl bg-panel px-3 py-2 text-[11px]"
                      >
                        <span>
                          {item.kind === "review_due"
                            ? "复习摘要"
                            : "待审核摘要"}{" "}
                          · {DELIVERY_CHANNEL_LABELS[String(item.channel)] ?? String(item.channel)}
                        </span>
                        <span className="text-ink-secondary">
                          {statusLabel(item.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
