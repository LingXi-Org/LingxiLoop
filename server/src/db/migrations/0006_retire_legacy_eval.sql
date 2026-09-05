-- Stop old Eval writers and archive any required historical results before deployment.
-- The independent black-box Eval owns its own store; these internal traces are retired.
-- No CASCADE: unexpected consumers must make migration fail rather than lose their data.
DROP TABLE public.eval_stage_results;
DROP TABLE public.eval_cases;
DROP TABLE public.eval_runs;
