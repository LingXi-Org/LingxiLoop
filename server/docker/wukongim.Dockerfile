FROM docker.io/library/alpine:3.21 AS source

ARG WUKONG_COMMIT
RUN test -n "$WUKONG_COMMIT" \
 && apk add --no-cache git ca-certificates \
 && git init /src \
 && cd /src \
 && git remote add origin https://github.com/WuKongIM/WuKongIM.git \
 && git fetch --depth 1 origin "$WUKONG_COMMIT" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$WUKONG_COMMIT"

# Recover only the old writer's compacted-prefix defect after validating the
# snapshot, retained CRC chain, node identity and complete committed suffix.
ARG WUKONG_RAFTSTORE_FIX_COMMIT=0194a738d04836899b998de8b4ac392b3aadb979
RUN cd /src \
 && git fetch --depth 1 origin "$WUKONG_RAFTSTORE_FIX_COMMIT" \
 && test "$(git rev-parse FETCH_HEAD)" = "$WUKONG_RAFTSTORE_FIX_COMMIT" \
 && git checkout FETCH_HEAD -- pkg/controller/raft/raftstore

FROM docker.io/library/golang:1.25.0 AS builder

ARG TARGETOS=linux
ARG TARGETARCH
WORKDIR /src
COPY --from=source /src ./
RUN go mod download \
 && go test -count=1 ./pkg/controller/raft/raftstore \
 && export CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=${TARGETARCH:-$(go env GOARCH)} \
 && go build -trimpath -o /out/wukongim.debug ./cmd/wukongim \
 && go build -trimpath -ldflags="-s -w" -o /out/wukongim ./cmd/wukongim \
 && { printf 'upstream_commit=%s\nraftstore_fix_commit=%s\nplatform=%s/%s\n' \
        "$(git rev-parse HEAD)" "$(git rev-parse FETCH_HEAD)" "$GOOS" "$GOARCH"; \
      go version; \
      printf 'debug_flags=-trimpath\nrelease_flags=-trimpath -ldflags="-s -w"\n'; \
      cd /out && sha256sum wukongim wukongim.debug; \
    } > /out/build-info.txt

FROM docker.io/library/alpine:3.19 AS runtime

RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY server/wukongim/wukongim.toml /etc/wukongim/wukongim.toml
EXPOSE 5001 5100 5200 5301 7000 19092
ENTRYPOINT ["/usr/local/bin/wukongim", "-config", "/etc/wukongim/wukongim.toml"]

# Build with --target debug for the same source/toolchain and full Go symbols.
# Both images identify both binaries; the debug target keeps the normal config.
FROM runtime AS debug
COPY --from=builder /out/wukongim.debug /usr/local/bin/wukongim
COPY --from=builder /out/build-info.txt /usr/local/share/wukongim/build-info.txt

# Keep release last so existing builds and Compose select the smaller binary.
FROM runtime AS release
COPY --from=builder /out/wukongim /usr/local/bin/wukongim
COPY --from=builder /out/build-info.txt /usr/local/share/wukongim/build-info.txt
