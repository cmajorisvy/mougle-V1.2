echo "### SERVICE DIFF ###"
git --no-optional-locks diff server/services/production-house-service.ts
echo "### CLIENT DIFF ###"
git --no-optional-locks diff client/src/pages/admin/ProductionHouse.tsx
echo "### TESTS DIFF ###"
git --no-optional-locks diff tests/production-house.test.ts
