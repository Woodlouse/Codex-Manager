use super::{Arc, Mutex, UpstreamResponseUsage};
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::Duration;

const DEFAULT_SSE_KEEPALIVE_INTERVAL_MS: u64 = 15_000;
const ENV_SSE_KEEPALIVE_INTERVAL_MS: &str = "CODEXMANAGER_SSE_KEEPALIVE_INTERVAL_MS";

static SSE_KEEPALIVE_INTERVAL_MS: AtomicU64 = AtomicU64::new(DEFAULT_SSE_KEEPALIVE_INTERVAL_MS);

#[derive(Debug, Clone, Default)]
pub(crate) struct PassthroughSseCollector {
    pub(crate) usage: UpstreamResponseUsage,
    pub(crate) saw_terminal: bool,
    pub(crate) terminal_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SseKeepAliveFrame {
    Comment,
    OpenAIResponses,
    OpenAIChatCompletions,
    OpenAICompletions,
    Anthropic,
}

impl SseKeepAliveFrame {
    pub(crate) fn bytes(self) -> &'static [u8] {
        match self {
            Self::Comment => b": keep-alive\n\n",
            Self::OpenAIResponses => b"data: {\"type\":\"codexmanager.keepalive\"}\n\n",
            Self::OpenAIChatCompletions => {
                b"data: {\"id\":\"cm_keepalive\",\"object\":\"chat.completion.chunk\",\"created\":0,\"model\":\"codexmanager.keepalive\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":null}]}\n\n"
            }
            Self::OpenAICompletions => {
                b"data: {\"id\":\"cm_keepalive\",\"object\":\"text_completion\",\"created\":0,\"model\":\"codexmanager.keepalive\",\"choices\":[{\"index\":0,\"text\":\"\",\"finish_reason\":null}]}\n\n"
            }
            Self::Anthropic => {
                b"event: ping\ndata: {\"type\":\"ping\"}\n\n"
            }
        }
    }
}

#[derive(Debug)]
pub(crate) enum UpstreamSseFramePumpItem {
    Frame(Vec<String>),
    Eof,
    Error(String),
}

pub(crate) struct UpstreamSseFramePump {
    rx: Receiver<UpstreamSseFramePumpItem>,
}

impl UpstreamSseFramePump {
    pub(crate) fn new(upstream: reqwest::blocking::Response) -> Self {
        let (tx, rx) = mpsc::sync_channel::<UpstreamSseFramePumpItem>(32);
        thread::spawn(move || {
            let mut reader = BufReader::new(upstream);
            let mut pending_frame_lines = Vec::new();
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) => {
                        if !pending_frame_lines.is_empty()
                            && tx
                                .send(UpstreamSseFramePumpItem::Frame(pending_frame_lines))
                                .is_err()
                        {
                            return;
                        }
                        let _ = tx.send(UpstreamSseFramePumpItem::Eof);
                        return;
                    }
                    Ok(_) => {
                        let is_blank = line == "\n" || line == "\r\n";
                        pending_frame_lines.push(line);
                        if is_blank {
                            let frame = std::mem::take(&mut pending_frame_lines);
                            if tx.send(UpstreamSseFramePumpItem::Frame(frame)).is_err() {
                                return;
                            }
                        }
                    }
                    Err(err) => {
                        let _ = tx.send(UpstreamSseFramePumpItem::Error(err.to_string()));
                        return;
                    }
                }
            }
        });
        Self { rx }
    }

    pub(crate) fn recv_timeout(
        &self,
        timeout: Duration,
    ) -> Result<UpstreamSseFramePumpItem, RecvTimeoutError> {
        self.rx.recv_timeout(timeout)
    }
}

pub(super) fn reload_from_env() {
    SSE_KEEPALIVE_INTERVAL_MS.store(
        std::env::var(ENV_SSE_KEEPALIVE_INTERVAL_MS)
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .unwrap_or(DEFAULT_SSE_KEEPALIVE_INTERVAL_MS),
        Ordering::Relaxed,
    );
}

pub(super) fn sse_keepalive_interval() -> Duration {
    let interval_ms = SSE_KEEPALIVE_INTERVAL_MS.load(Ordering::Relaxed);
    Duration::from_millis(interval_ms.max(1))
}

pub(super) fn current_sse_keepalive_interval_ms() -> u64 {
    SSE_KEEPALIVE_INTERVAL_MS.load(Ordering::Relaxed).max(1)
}

pub(super) fn set_sse_keepalive_interval_ms(interval_ms: u64) -> Result<u64, String> {
    if interval_ms == 0 {
        return Err("SSE keepalive interval must be greater than 0".to_string());
    }
    SSE_KEEPALIVE_INTERVAL_MS.store(interval_ms, Ordering::Relaxed);
    std::env::set_var(ENV_SSE_KEEPALIVE_INTERVAL_MS, interval_ms.to_string());
    Ok(interval_ms)
}

pub(super) fn collector_output_text_trimmed(
    usage_collector: &Arc<Mutex<PassthroughSseCollector>>,
) -> Option<String> {
    usage_collector
        .lock()
        .ok()
        .and_then(|collector| collector.usage.output_text.clone())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

pub(super) fn mark_collector_terminal_success(
    usage_collector: &Arc<Mutex<PassthroughSseCollector>>,
) {
    if let Ok(mut collector) = usage_collector.lock() {
        collector.saw_terminal = true;
        collector.terminal_error = None;
    }
}
