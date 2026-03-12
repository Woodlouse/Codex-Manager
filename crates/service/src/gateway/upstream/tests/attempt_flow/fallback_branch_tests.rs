use super::should_failover_after_fallback_non_success;

#[test]
fn fallback_non_success_5xx_does_not_failover_even_with_more_candidates() {
    assert!(!should_failover_after_fallback_non_success(500, true));
    assert!(!should_failover_after_fallback_non_success(503, true));
}

#[test]
fn fallback_non_success_auth_and_rate_limit_can_failover_when_candidates_remain() {
    assert!(should_failover_after_fallback_non_success(401, true));
    assert!(should_failover_after_fallback_non_success(403, true));
    assert!(should_failover_after_fallback_non_success(404, true));
    assert!(should_failover_after_fallback_non_success(429, true));
}

#[test]
fn fallback_non_success_never_failover_without_more_candidates() {
    assert!(!should_failover_after_fallback_non_success(401, false));
    assert!(!should_failover_after_fallback_non_success(429, false));
    assert!(!should_failover_after_fallback_non_success(500, false));
}
