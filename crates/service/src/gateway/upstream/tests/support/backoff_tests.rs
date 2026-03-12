use super::exponential_jitter_delay;
use std::time::Duration;

#[test]
fn jitter_delay_stays_within_cap() {
    let base = Duration::from_millis(80);
    let cap = Duration::from_millis(600);
    for _ in 0..32 {
        let delay = exponential_jitter_delay(base, cap, 4);
        assert!(delay <= cap);
    }
}
