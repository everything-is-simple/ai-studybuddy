function enqueueJob(db, job) {
  db.prepare(`INSERT INTO jobs (id, job_type, status, payload_json, attempts, max_attempts, available_at)
    VALUES (@id, @job_type, 'pending', @payload_json, 0, @max_attempts, @available_at)`).run(job);
}
function recoverStaleJobs(db, now) {
  return db.prepare(`UPDATE jobs SET status='pending', started_at=NULL, error_summary='Recovered stale running job'
    WHERE status='running' AND started_at < ?`).run(now).changes;
}
function claimNextJob(db, now) {
  const transaction = db.transaction(() => {
    const job = db.prepare(`SELECT * FROM jobs WHERE status='pending' AND available_at <= ? ORDER BY available_at, id LIMIT 1`).get(now);
    if (!job) return null;
    db.prepare(`UPDATE jobs SET status='running', attempts=attempts+1, started_at=?, error_summary=NULL WHERE id=?`).run(now, job.id);
    return db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
  });
  return transaction.immediate();
}
function finishJob(db, id, now) { db.prepare(`UPDATE jobs SET status='completed', completed_at=? WHERE id=?`).run(now, id); }
function failJob(db, job, error, now) {
  const retry = job.attempts < job.max_attempts;
  db.prepare(`UPDATE jobs SET status=?, available_at=?, error_summary=?, started_at=NULL WHERE id=?`).run(retry ? 'pending' : 'failed', now, String(error).slice(0, 500), job.id);
  return retry ? 'pending' : 'failed';
}
module.exports = { enqueueJob, recoverStaleJobs, claimNextJob, finishJob, failJob };
