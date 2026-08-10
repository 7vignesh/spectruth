/**
 * Repair module — previews, approval, and re-audit.
 *
 * Nothing here modifies source code. Previews describe work, approval records
 * consent, and re-audit checks the result independently.
 */

export {
  PREVIEW_DIR,
  buildRepairPreviews,
  computePreviewId,
  findPreview,
  previewDirFor,
  previewPathFor,
  readPreviews,
  savePreviews,
} from './preview.js';

export {
  APPROVAL_DIR,
  PROTECTED_PATHS,
  approvalDirFor,
  approvalPathFor,
  approveRepair,
  assertApproved,
  checkApproval,
  computeStateFingerprint,
  isProtectedPath,
  readApproval,
} from './approval.js';
export type { ApproveOptions, ApprovalCheckOptions } from './approval.js';

export { compareReports, formatReauditSummary, reauditTask } from './reaudit.js';
export type { CriterionDelta, ReauditOptions, ReauditResult } from './reaudit.js';
