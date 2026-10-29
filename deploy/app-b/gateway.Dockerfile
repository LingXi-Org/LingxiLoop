FROM docker.io/library/nginx:alpine
COPY deploy/app-b/gateway.conf /etc/nginx/conf.d/default.conf
