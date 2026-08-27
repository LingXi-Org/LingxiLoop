# Mobile presigned-upload acceptance

This smoke test exercises the released mobile data path that unit tests cannot:

```text
authenticated app -> /uploads/capabilities -> /uploads/presign
                  -> WebView fetch(File) PUT -> R2
```

It must run against a deployment where `presignSupported` is true. The
production deployment reconciles and reads back the target bucket CORS policy
before cutover; a device run then proves the WebView origin and binary path.

## Build the instrumented app

The acceptance panel is opt-in and excluded from ordinary startup:

```sh
VITE_MOBILE_UPLOAD_SMOKE=1 npm run mobile:sync
```

Open the iOS or Android project, install it on a physical device, sign in, and
select a representative 24 MiB file in the panel at the bottom of the app. This
stays just below LingxiLoop's 25 MiB attachment ceiling while exercising the
largest supported upload path. Keep Xcode Instruments (Allocations) or Android Studio Memory Profiler
recording from before file selection until at least ten seconds after upload.

Run once on each platform and attach the panel's `[mobile-upload-smoke] RESULT`
object plus the profiler screenshot/export to the pull request. Acceptance
requires:

- `status: passed`, an R2 object key, and no CORS/preflight error;
- the app remains responsive and is not terminated by the OS;
- peak process memory does not show a second file-sized allocation attributable
  to a JavaScript/native HTTP bridge copy;
- a normal build without `VITE_MOBILE_UPLOAD_SMOKE=1` shows no smoke panel.

Record device model, OS version, build commit, file size, elapsed time, baseline
memory, peak memory, and post-upload memory. JavaScript heap fields may be
`null` on iOS; the platform profiler is authoritative for peak process memory.
