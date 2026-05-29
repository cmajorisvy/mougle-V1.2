#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:5000}
ADMIN_USER=${ADMIN_USER:-admin}
ADMIN_PASS=${ADMIN_PASS:-changeme}
USER_EMAIL=${USER_EMAIL:-cmajorisvy@gmail.com}
USER_PASS=${USER_PASS:-Value@1978}
COOKIE_JAR=$(mktemp)

json() { jq -r "$1"; }

info() { printf "\n== %s ==\n" "$1"; }

info "Health check"
curl -sS "$BASE_URL/" >/dev/null

info "Admin login"
ADMIN_TOKEN=$(curl -sS -X POST "$BASE_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" | json '.token')

if [[ -z "$ADMIN_TOKEN" || "$ADMIN_TOKEN" == "null" ]]; then
  echo "Admin login failed" >&2
  exit 1
fi

info "Admin stats"
curl -sS "$BASE_URL/api/admin/stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.' >/dev/null

info "User sign in"
USER_JSON=$(curl -sS -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}")
USER_ID=$(echo "$USER_JSON" | json '.id')

if [[ -z "$USER_ID" || "$USER_ID" == "null" ]]; then
  echo "User sign in failed" >&2
  exit 1
fi

info "List topics"
curl -sS "$BASE_URL/api/topics" | jq '.[0]' >/dev/null

info "Create post"
POST_ID=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE_URL/api/posts" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Smoke Test Post\",\"content\":\"Hello from smoke test\",\"topicSlug\":\"tech\",\"authorId\":\"$USER_ID\"}" | json '.id')

if [[ -z "$POST_ID" || "$POST_ID" == "null" ]]; then
  echo "Post create failed" >&2
  exit 1
fi

info "Fetch post"
curl -sS "$BASE_URL/api/posts/$POST_ID" | jq '.id' >/dev/null

info "Create comment"
curl -sS -b "$COOKIE_JAR" -X POST "$BASE_URL/api/posts/$POST_ID/comments" \
  -H "Content-Type: application/json" \
  -d "{\"postId\":\"$POST_ID\",\"content\":\"Smoke comment\",\"authorId\":\"$USER_ID\"}" | jq '.id' >/dev/null

info "Like post"
curl -sS -b "$COOKIE_JAR" -X POST "$BASE_URL/api/posts/$POST_ID/like" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\"}" | jq '.' >/dev/null

info "Create debate"
DEBATE_ID=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE_URL/api/debates" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Smoke Test Debate\",\"topic\":\"ai\",\"description\":\"Smoke test debate\",\"createdBy\":\"$USER_ID\"}" | json '.id')

if [[ -z "$DEBATE_ID" || "$DEBATE_ID" == "null" ]]; then
  echo "Debate create failed" >&2
  exit 1
fi

info "Join debate"
curl -sS -b "$COOKIE_JAR" -X POST "$BASE_URL/api/debates/$DEBATE_ID/join" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"participantType\":\"human\",\"position\":\"neutral\"}" | jq '.id' >/dev/null

info "Start debate"
curl -sS -b "$COOKIE_JAR" -X POST "$BASE_URL/api/debates/$DEBATE_ID/start" \
  -H "Content-Type: application/json" \
  -d "{}" | jq '.id' >/dev/null

info "Debate stream check"
STREAM_OUT=$(mktemp)
curl -sS -N --max-time 5 "$BASE_URL/api/debates/$DEBATE_ID/stream" >"$STREAM_OUT" &
STREAM_PID=$!
sleep 1
curl -sS -b "$COOKIE_JAR" -X POST "$BASE_URL/api/debates/$DEBATE_ID/turn" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"content\":\"Smoke test turn\"}" | jq '.id' >/dev/null
sleep 1
kill "$STREAM_PID" >/dev/null 2>&1 || true
if ! grep -q "data:" "$STREAM_OUT"; then
  echo "Debate stream did not emit events" >&2
  exit 1
fi
rm -f "$STREAM_OUT"

info "Admin social accounts"
curl -sS "$BASE_URL/api/admin/social/accounts" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.' >/dev/null

info "Create social post (draft)"
SOCIAL_POST_ID=$(curl -sS -X POST "$BASE_URL/api/admin/social/posts" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"twitter\",\"contentType\":\"debate\",\"contentId\":\"$DEBATE_ID\",\"caption\":\"\"}" | json '.id')

if [[ -z "$SOCIAL_POST_ID" || "$SOCIAL_POST_ID" == "null" ]]; then
  echo "Social post create failed" >&2
  exit 1
fi

info "Generate social caption"
curl -sS -X POST "$BASE_URL/api/admin/social/generate-caption" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"contentType\":\"debate\",\"contentId\":\"$DEBATE_ID\",\"platform\":\"twitter\"}" | jq '.' >/dev/null

info "Trigger social publish"
curl -sS -X POST "$BASE_URL/api/admin/social/trigger-publish" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.' >/dev/null

info "Publish social post (direct)"
PUBLISH_CODE=$(curl -sS -o /tmp/social_publish_resp.json -w "%{http_code}" -X POST \
  "$BASE_URL/api/admin/social/posts/$SOCIAL_POST_ID/publish" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
if [[ "$PUBLISH_CODE" != "200" ]]; then
  echo "Warning: direct publish failed (HTTP $PUBLISH_CODE). Check social account config." >&2
else
  cat /tmp/social_publish_resp.json | jq '.' >/dev/null
fi

info "Flywheel status"
FLYWHEEL_ENABLED=$(curl -sS "$BASE_URL/api/flywheel/status" | json '.enabled')
if [[ "$FLYWHEEL_ENABLED" == "true" ]]; then
  info "Trigger flywheel"
  curl -sS -X POST "$BASE_URL/api/flywheel/trigger/$DEBATE_ID" | jq '.id' >/dev/null || true
else
  echo "Flywheel disabled, skipping trigger"
fi

info "Done"
echo "Smoke tests passed"
