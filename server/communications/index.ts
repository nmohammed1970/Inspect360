export { registerCommunicationsRoutes } from "./routes";
export {
  ensureCaseLinkedToMaintenanceRequest,
  scheduleMaintenanceCaseBridge,
  linkWorkOrderFromCase,
} from "./maintenanceBridge";
export { seedCommunicationCategories } from "./categories";
export { allocateCommunicationReference } from "./reference";
export { generateTriageSuggestion, detectSafetyKeywords } from "./ai";
