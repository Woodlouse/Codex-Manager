use rand::RngCore;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use tiny_http::Request;

use crate::gateway::IncomingHeaderSnapshot;

#[allow(dead_code)]
pub(crate) fn find_incoming_header<'a>(request: &'a Request, name: &str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str().trim())
        .filter(|value| !value.is_empty())
}

#[allow(dead_code)]
pub(crate) fn derive_sticky_session_id(request: &Request) -> Option<String> {
    let incoming_headers = IncomingHeaderSnapshot::from_request(request);
    derive_sticky_session_id_from_headers(&incoming_headers)
}

#[allow(dead_code)]
pub(crate) fn derive_sticky_conversation_id(request: &Request) -> Option<String> {
    let incoming_headers = IncomingHeaderSnapshot::from_request(request);
    derive_sticky_conversation_id_from_headers(&incoming_headers)
}

pub(crate) fn derive_sticky_session_id_from_headers(
    incoming_headers: &IncomingHeaderSnapshot,
) -> Option<String> {
    derive_sticky_id_from_material(incoming_headers.sticky_key_material(), "session")
}

pub(crate) fn derive_sticky_conversation_id_from_headers(
    incoming_headers: &IncomingHeaderSnapshot,
) -> Option<String> {
    derive_sticky_id_from_material(incoming_headers.sticky_key_material(), "conversation")
}

pub(crate) fn derive_sticky_session_id_from_headers_with_remote(
    incoming_headers: &IncomingHeaderSnapshot,
    remote: Option<SocketAddr>,
) -> Option<String> {
    derive_sticky_id_from_material_with_remote(
        incoming_headers.sticky_key_material(),
        remote,
        "session",
    )
}

pub(crate) fn derive_sticky_conversation_id_from_headers_with_remote(
    incoming_headers: &IncomingHeaderSnapshot,
    remote: Option<SocketAddr>,
) -> Option<String> {
    derive_sticky_id_from_material_with_remote(
        incoming_headers.sticky_key_material(),
        remote,
        "conversation",
    )
}

fn stable_session_id_from_material(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

fn derive_sticky_id_from_material(key_material: Option<&str>, salt: &str) -> Option<String> {
    let key_material = key_material?;
    Some(stable_session_id_from_material(&format!(
        "{salt}:{key_material}"
    )))
}

fn derive_sticky_id_from_material_with_remote(
    key_material: Option<&str>,
    remote: Option<SocketAddr>,
    salt: &str,
) -> Option<String> {
    let key_material = key_material?;
    if let Some(remote) = remote {
        return Some(stable_session_id_from_material(&format!(
            "{salt}:{key_material}:{remote}"
        )));
    }
    derive_sticky_id_from_material(Some(key_material), salt)
}

pub(super) fn random_session_id() -> String {
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}
