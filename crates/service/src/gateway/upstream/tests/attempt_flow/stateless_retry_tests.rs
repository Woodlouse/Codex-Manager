use super::should_trigger_stateless_retry;

#[test]
fn stateless_retry_disables_403_when_challenge_retry_is_disabled() {
    assert!(!should_trigger_stateless_retry(403, false, true));
    assert!(!should_trigger_stateless_retry(429, false, true));
    assert!(!should_trigger_stateless_retry(401, false, true));
    assert!(should_trigger_stateless_retry(404, false, true));
}

#[test]
fn stateless_retry_keeps_403_when_challenge_retry_is_enabled() {
    assert!(should_trigger_stateless_retry(403, false, false));
    assert!(should_trigger_stateless_retry(429, false, false));
    assert!(!should_trigger_stateless_retry(401, false, false));
}

#[test]
fn stateless_retry_respects_session_affinity_guard() {
    assert!(!should_trigger_stateless_retry(401, true, false));
    assert!(should_trigger_stateless_retry(403, true, false));
    assert!(should_trigger_stateless_retry(429, true, false));
    assert!(!should_trigger_stateless_retry(403, true, true));
    assert!(!should_trigger_stateless_retry(429, true, true));
}
