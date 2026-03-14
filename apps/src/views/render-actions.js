export function buildRenderActions({
  updateAccountSort,
  handleOpenUsageModal,
  setManualPreferredAccount,
  deleteAccount,
  refreshLoginFromRegisterDb,
  refreshAccountsPage,
  toggleApiKeyStatus,
  deleteApiKey,
  updateApiKeyModel,
  copyApiKey,
}) {
  return {
    onUpdateSort: updateAccountSort,
    onOpenUsage: handleOpenUsageModal,
    onSetCurrentAccount: setManualPreferredAccount,
    onDeleteAccount: deleteAccount,
    onRefreshLoginFromRegisterDb: refreshLoginFromRegisterDb,
    onRefreshAccountPage: refreshAccountsPage,
    onToggleApiKeyStatus: toggleApiKeyStatus,
    onDeleteApiKey: deleteApiKey,
    onUpdateApiKeyModel: updateApiKeyModel,
    onCopyApiKey: copyApiKey,
  };
}
