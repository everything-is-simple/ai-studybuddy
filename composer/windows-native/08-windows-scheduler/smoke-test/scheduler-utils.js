const path = require('node:path');

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[character]));
}

function buildTaskXml({ nodePath, runnerPath, outputPath }) {
  const workDir = path.dirname(runnerPath);
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>AI StudyBuddy Phase 0.7 temporary scheduler smoke test</Description></RegistrationInfo>
  <Triggers><TimeTrigger><StartBoundary>2026-05-31T22:30:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT2M</ExecutionTimeLimit><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>${xmlEscape(nodePath)}</Command><Arguments>"${xmlEscape(runnerPath)}" "${xmlEscape(outputPath)}"</Arguments><WorkingDirectory>${xmlEscape(workDir)}</WorkingDirectory></Exec></Actions>
</Task>`;
}

function sanitizeSchedulerError(message) {
  return String(message).replace(/[A-Za-z]:\\[^\r\n"']+/g, '<local-path>');
}

module.exports = { buildTaskXml, sanitizeSchedulerError };
