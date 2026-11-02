export async function audit(db, { orgId = null, userId = null, action, entity = null, entityId = null, detail = null, ip = null }) {
  try {
    await db.query(
      'INSERT INTO audit_log (organization_id, user_id, action, entity, entity_id, detail, ip) VALUES (:o, :u, :a, :e, :i, :d, :ip)',
      { o: orgId, u: userId, a: action, e: entity, i: entityId, d: detail ? JSON.stringify(detail) : null, ip },
    );
  } catch (e) {
    console.error('audit write failed', e.message); // never block the request on the audit log
  }
}
