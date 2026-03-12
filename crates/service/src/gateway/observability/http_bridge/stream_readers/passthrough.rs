use super::{
    inspect_sse_frame, merge_usage, sse_keepalive_interval, Arc, Cursor, Mutex,
    PassthroughSseCollector, Read, SseKeepAliveFrame, SseTerminal, UpstreamSseFramePump,
    UpstreamSseFramePumpItem,
};

pub(crate) struct PassthroughSseUsageReader {
    upstream: UpstreamSseFramePump,
    out_cursor: Cursor<Vec<u8>>,
    usage_collector: Arc<Mutex<PassthroughSseCollector>>,
    keepalive_frame: SseKeepAliveFrame,
    finished: bool,
}

impl PassthroughSseUsageReader {
    pub(crate) fn new(
        upstream: reqwest::blocking::Response,
        usage_collector: Arc<Mutex<PassthroughSseCollector>>,
        keepalive_frame: SseKeepAliveFrame,
    ) -> Self {
        Self {
            upstream: UpstreamSseFramePump::new(upstream),
            out_cursor: Cursor::new(Vec::new()),
            usage_collector,
            keepalive_frame,
            finished: false,
        }
    }

    fn update_usage_from_frame(&self, lines: &[String]) {
        let inspection = inspect_sse_frame(lines);
        if inspection.usage.is_none() && inspection.terminal.is_none() {
            return;
        }
        if let Ok(mut collector) = self.usage_collector.lock() {
            if let Some(parsed) = inspection.usage {
                merge_usage(&mut collector.usage, parsed);
            }
            if let Some(terminal) = inspection.terminal {
                collector.saw_terminal = true;
                if let SseTerminal::Err(message) = terminal {
                    collector.terminal_error = Some(message);
                }
            }
        }
    }

    fn next_chunk(&mut self) -> std::io::Result<Vec<u8>> {
        match self.upstream.recv_timeout(sse_keepalive_interval()) {
            Ok(UpstreamSseFramePumpItem::Frame(frame)) => {
                self.update_usage_from_frame(&frame);
                Ok(frame.concat().into_bytes())
            }
            Ok(UpstreamSseFramePumpItem::Eof) => {
                if let Ok(mut collector) = self.usage_collector.lock() {
                    if !collector.saw_terminal {
                        collector.terminal_error.get_or_insert_with(|| {
                            "stream disconnected before completion".to_string()
                        });
                    }
                }
                self.finished = true;
                Ok(Vec::new())
            }
            Ok(UpstreamSseFramePumpItem::Error(err)) => {
                if let Ok(mut collector) = self.usage_collector.lock() {
                    collector
                        .terminal_error
                        .get_or_insert_with(|| format!("stream read failed: {err}"));
                }
                self.finished = true;
                Ok(Vec::new())
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                Ok(self.keepalive_frame.bytes().to_vec())
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                if let Ok(mut collector) = self.usage_collector.lock() {
                    collector.terminal_error.get_or_insert_with(|| {
                        "stream reader disconnected unexpectedly".to_string()
                    });
                }
                self.finished = true;
                Ok(Vec::new())
            }
        }
    }
}

impl Read for PassthroughSseUsageReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        loop {
            let read = self.out_cursor.read(buf)?;
            if read > 0 {
                return Ok(read);
            }
            if self.finished {
                return Ok(0);
            }
            self.out_cursor = Cursor::new(self.next_chunk()?);
        }
    }
}
