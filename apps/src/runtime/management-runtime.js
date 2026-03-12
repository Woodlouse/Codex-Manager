import { createManagementActions } from "../services/management-actions";

export function createManagementRuntime(deps) {
  const managementActions = createManagementActions(deps);
  const {
    handleClearRequestLogs,
    updateAccountSort,
    setManualPreferredAccount,
    deleteAccount,
    importAccountsFromFiles,
    importAccountsFromDirectory,
    deleteSelectedAccounts,
    deleteUnavailableFreeAccounts,
    exportAccountsByFile,
    handleOpenUsageModal,
    refreshUsageForAccount,
    createApiKey,
    deleteApiKey,
    toggleApiKeyStatus,
    updateApiKeyModel,
    copyApiKey,
    refreshApiModelsNow,
  } = managementActions;

  return {
    copyApiKey,
    createApiKey,
    deleteAccount,
    deleteApiKey,
    deleteSelectedAccounts,
    deleteUnavailableFreeAccounts,
    exportAccountsByFile,
    handleClearRequestLogs,
    handleOpenUsageModal,
    importAccountsFromDirectory,
    importAccountsFromFiles,
    refreshApiModelsNow,
    refreshUsageForAccount,
    setManualPreferredAccount,
    toggleApiKeyStatus,
    updateAccountSort,
    updateApiKeyModel,
  };
}
