FROM alpine:3.21 AS source

ARG WUKONG_COMMIT
RUN test -n "$WUKONG_COMMIT" \
 && apk add --no-cache git ca-certificates \
 && git init /src \
 && cd /src \
 && git remote add origin https://github.com/WuKongIM/WuKongIM.git \
 && git fetch --depth 1 origin "$WUKONG_COMMIT" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$WUKONG_COMMIT"

FROM golang:1.25.0 AS builder

ARG TARGETOS=linux
ARG TARGETARCH
WORKDIR /src
COPY --from=source /src ./
RUN go mod download \
 && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=${TARGETARCH:-$(go env GOARCH)} \
      go build -trimpath -o /out/wukongim ./cmd/wukongim

FROM alpine:3.19

RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /out/wukongim /usr/local/bin/wukongim
COPY server/wukongim/wukongim.toml /etc/wukongim/wukongim.toml
EXPOSE 5001 5100 5200 5301 7000 19092
ENTRYPOINT ["/usr/local/bin/wukongim", "-config", "/etc/wukongim/wukongim.toml"]
