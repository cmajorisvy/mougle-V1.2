grep -E "getAssetLibrary|getProductionPackage|getProductionChecklist|AssetLibraryFilters|AssetLibraryEntry|ProductionChecklist" server/services/production-house-service.ts
grep -E "asset-library|package|checklist|asset_library.viewed|production_package.viewed|production_package.checklist_generated|production_package.exported" server/routes/production-house-routes.ts
grep -E "asset-bundle" server/routes/production-house-routes.ts
grep -E "library|package|AssetLibrary|ProductionPackageViewer|SafetyBadges|ProviderBadge" client/src/pages/admin/ProductionHouse.tsx
