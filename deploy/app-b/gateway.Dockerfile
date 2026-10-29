FROM docker.io/library/nginx:alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606
COPY deploy/app-b/gateway.conf /etc/nginx/conf.d/default.conf
