"""Typed IPython SDK for the Host-scoped Pulse teacher surface."""

from typing import Any, Literal, NotRequired, Protocol, TypedDict


ActivityType = Literal["LESSON", "PRACTICE", "ASSESSMENT", "PROJECT", "REVIEW"]
EvaluationMode = Literal["AGENT_FORMATIVE", "TEACHER_REQUIRED"]
MasteryLevel = Literal[1, 2, 3, 4]
Weekday = Literal[
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
]


class ObjectiveDraft(TypedDict):
    title: str
    success_criteria: str
    target_level: MasteryLevel
    prerequisite_ids: NotRequired[list[str]]


class HostBridge(Protocol):
    def call(self, action: str, args: dict[str, Any]) -> Any: ...


class TeacherSDK:
    """Expose only supported ``loop.teacher.*`` Host Actions.

    Tenant, Project, course, room, Agent, and human authorization scope are
    fixed by the durable work item and therefore never appear as SDK inputs.
    """

    def __init__(self, bridge: HostBridge):
        self._bridge = bridge

    def _call(self, method: str, **kwargs: Any) -> Any:
        return self._bridge.call(
            f"teacher.{method}",
            {key: value for key, value in kwargs.items() if value is not None},
        )

    def current(self) -> Any:
        return self._call("current")

    def overview(self, *, window_days: int = 30) -> Any:
        return self._call("overview", window_days=window_days)

    def list_learners(self, *, attention_only: bool = False) -> Any:
        return self._call("list_learners", attention_only=attention_only)

    def get_learner(self, *, learner_id: str) -> Any:
        return self._call("get_learner", learner_id=learner_id)

    def get_attempt(self, *, attempt_id: str) -> Any:
        return self._call("get_attempt", attempt_id=attempt_id)

    def list_objectives(self) -> Any:
        return self._call("list_objectives")

    def list_activities(self) -> Any:
        return self._call("list_activities")

    def list_reviews(self) -> Any:
        return self._call("list_reviews")

    def list_rooms(self) -> Any:
        return self._call("list_rooms")

    def get_digest_schedule(self) -> Any:
        return self._call("get_digest_schedule")

    def draft_objectives(self, *, objectives: list[ObjectiveDraft]) -> Any:
        return self._call("draft_objectives", objectives=objectives)

    def draft_activity(
        self,
        *,
        title: str,
        instructions: str,
        type: ActivityType,
        objective_ids: list[str],
        evaluation_mode: EvaluationMode = "TEACHER_REQUIRED",
        target_level: MasteryLevel = 2,
        rubric: list[Any] | None = None,
        due_at: str | None = None,
    ) -> Any:
        return self._call(
            "draft_activity",
            title=title,
            instructions=instructions,
            type=type,
            objective_ids=objective_ids,
            evaluation_mode=evaluation_mode,
            target_level=target_level,
            rubric=[] if rubric is None else rubric,
            due_at=due_at,
        )

    def update_course(
        self,
        *,
        title: str | None = None,
        description: str | None = None,
    ) -> Any:
        return self._call("update_course", title=title, description=description)

    def set_learner_membership(self, *, user_id: str, enabled: bool = True) -> Any:
        return self._call("set_learner_membership", user_id=user_id, enabled=enabled)

    def set_room_binding(
        self,
        *,
        conversation_id: str,
        purpose: Literal["lab", "discussion"] | None = None,
        enabled: bool = True,
    ) -> Any:
        return self._call(
            "set_room_binding",
            conversation_id=conversation_id,
            purpose=purpose,
            enabled=enabled,
        )

    def configure_digest(
        self,
        *,
        frequency: Literal["daily", "weekly", "off"],
        timezone: str = "Asia/Shanghai",
        local_time: str | None = None,
        weekday: Weekday | None = None,
    ) -> Any:
        return self._call(
            "configure_digest",
            frequency=frequency,
            timezone=timezone,
            local_time=local_time,
            weekday=weekday,
        )

    def publish_objective(self, *, objective_id: str) -> Any:
        return self._call("publish_objective", objective_id=objective_id)

    def publish_activity(self, *, activity_id: str) -> Any:
        return self._call("publish_activity", activity_id=activity_id)

    def close_activity(self, *, activity_id: str) -> Any:
        return self._call("close_activity", activity_id=activity_id)

    def archive_objective(self, *, objective_id: str) -> Any:
        return self._call("archive_objective", objective_id=objective_id)

    def transition_course(
        self,
        *,
        command: Literal["END", "ENTER_READ_ONLY", "ARCHIVE"],
    ) -> Any:
        return self._call("transition_course", command=command)

    def set_teacher_membership(self, *, user_id: str, enabled: bool = True) -> Any:
        return self._call("set_teacher_membership", user_id=user_id, enabled=enabled)

    def review_evaluation(
        self,
        *,
        evaluation_id: str,
        decision: Literal["accept", "reject"],
        reason: str,
    ) -> Any:
        return self._call(
            "review_evaluation",
            evaluation_id=evaluation_id,
            decision=decision,
            reason=reason,
        )
