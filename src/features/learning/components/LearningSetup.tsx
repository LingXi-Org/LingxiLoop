import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { learningApi } from '../api'
import type { LearningCourse, LearningObjective } from '../contracts'
import { LearningCard as Card } from './LearningPrimitives'
import { useApp } from '@/stores/app'

export function Onboarding({ onCreated }: { onCreated: () => Promise<void> }) {
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

export function TeacherComposer({
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
