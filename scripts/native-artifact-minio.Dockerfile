# Acceptance only. The historical release images and download archives were
# removed upstream; build the same release from its immutable source instead.
FROM docker.io/library/golang:1.24.2 AS build
ARG MINIO_COMMIT=0d7408fc9969caf07de6a8c3a84f9fbb10a6739e
WORKDIR /src
RUN git init . \
 && git remote add origin https://github.com/minio/minio.git \
 && git fetch --depth 1 origin "$MINIO_COMMIT" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$MINIO_COMMIT" \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/minio .

FROM docker.io/library/alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=build /out/minio /usr/local/bin/minio
ENTRYPOINT ["/usr/local/bin/minio"]
