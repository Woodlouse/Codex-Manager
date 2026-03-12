mod address;
mod http;
mod transport;

pub(crate) use address::normalize_addr;
pub(crate) use transport::rpc_call;
#[cfg(test)]
pub(crate) use transport::rpc_call_with_sockets;
