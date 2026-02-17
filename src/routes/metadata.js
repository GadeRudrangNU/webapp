// src/routes/metadata.js
const express = require("express");

const router = express.Router();

// Parse raw bytes ONLY for this endpoint so we can reliably detect "body present" on GET
router.use("/v1/metadata", express.raw({ type: "*/*" }));

// --- helpers (use your existing Error schema helper if you have one) ---
function badRequest(res, message) {
    return res.status(400).json({ message });
}
function methodNotAllowed(res) {
    return res.status(405).end();
}
function serviceUnavailable(res, message) {
    return res.status(503).json({ message });
}

// Always add cache headers on ALL responses from this endpoint
function setNoCache(res) {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
}

// Reject query params
function rejectQueryParams(req, res) {
    if (req.query && Object.keys(req.query).length > 0) {
        setNoCache(res);
        return badRequest(res, "Query parameters are not allowed.");
    }
    return null;
}

// Reject request body for GET (actual bytes, not just headers)
function rejectBody(req, res) {
    if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
        setNoCache(res);
        return badRequest(res, "Request body is not allowed.");
    }
    return null;
}

// ---- Minimal HTTP client with timeout ----
async function httpGet(url, { headers = {}, timeoutMs = 1500 } = {}) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const resp = await fetch(url, { headers, signal: ac.signal });
        return resp;
    } finally {
        clearTimeout(t);
    }
}

// ---- Platform detection (cached) ----
let cachedPlatform = null; // "aws" | "gcp" | null

async function detectPlatform() {
    if (cachedPlatform) return cachedPlatform;

    // Try GCP first (requires Metadata-Flavor header)
    try {
        const r = await httpGet("http://metadata.google.internal/computeMetadata/v1/", {
            headers: { "Metadata-Flavor": "Google" },
            timeoutMs: 1200,
        });
        const flavor = r.headers.get("metadata-flavor");
        if (r.ok && flavor && flavor.toLowerCase() === "google") {
            cachedPlatform = "gcp";
            return cachedPlatform;
        }
    } catch (_) {
        // ignore
    }

    // Try AWS IMDSv2 token request (good signal you're on AWS)
    try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 1200);

        const tokenResp = await fetch("http://169.254.169.254/latest/api/token", {
            method: "PUT",
            headers: { "X-aws-ec2-metadata-token-ttl-seconds": "21600" },
            signal: ac.signal,
        });

        clearTimeout(t);

        if (tokenResp.ok) {
            cachedPlatform = "aws";
            return cachedPlatform;
        }
    } catch (_) {
        // ignore
    }

    return null;
}

function lastPathSegment(s) {
    if (!s) return s;
    const parts = String(s).split("/");
    return parts[parts.length - 1];
}

function parseLines(text) {
    return String(text)
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
}

// ---- AWS metadata helpers ----
async function awsToken() {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);

    try {
        const r = await fetch("http://169.254.169.254/latest/api/token", {
            method: "PUT",
            headers: { "X-aws-ec2-metadata-token-ttl-seconds": "21600" },
            signal: ac.signal,
        });
        if (!r.ok) return null;
        return await r.text();
    } finally {
        clearTimeout(t);
    }
}

async function awsGet(path, token) {
    const r = await httpGet(`http://169.254.169.254${path}`, {
        headers: token ? { "X-aws-ec2-metadata-token": token } : {},
        timeoutMs: 1500,
    });

    if (!r.ok) {
        const err = new Error(`AWS metadata failed: ${path} status=${r.status}`);
        err.status = r.status;
        throw err;
    }
    return await r.text();
}

// ---- GCP metadata helpers ----
async function gcpGet(path) {
    const r = await httpGet(`http://metadata.google.internal${path}`, {
        headers: { "Metadata-Flavor": "Google" },
        timeoutMs: 1500,
    });

    if (!r.ok) {
        const err = new Error(`GCP metadata failed: ${path} status=${r.status}`);
        err.status = r.status;
        throw err;
    }
    return await r.text();
}

// ---- Build response objects ----
async function buildAwsMetadataResponse() {
    const token = await awsToken(); // IMDSv2
    if (!token) throw new Error("Unable to obtain AWS IMDSv2 token.");

    const instanceId = (await awsGet("/latest/meta-data/instance-id", token)).trim();

    const az = (await awsGet("/latest/meta-data/placement/availability-zone", token)).trim();
    const region = az.length >= 2 ? az.slice(0, -1) : az; // us-east-1a -> us-east-1

    const machineType = (await awsGet("/latest/meta-data/instance-type", token)).trim();

    const macsRaw = await awsGet("/latest/meta-data/network/interfaces/macs/", token);
    const macs = parseLines(macsRaw).map((m) => m.replace(/\/$/, ""));

    const networkInterfaces = [];
    for (const mac of macs) {
        const privateIpsRaw = await awsGet(
            `/latest/meta-data/network/interfaces/macs/${mac}/local-ipv4s`,
            token
        );
        const privateIp = parseLines(privateIpsRaw)[0] || null;

        let publicIp = null;
        try {
            const publicIpsRaw = await awsGet(
                `/latest/meta-data/network/interfaces/macs/${mac}/public-ipv4s`,
                token
            );
            publicIp = parseLines(publicIpsRaw)[0] || null;
        } catch (_) {
            // may 404 if no public IP assigned
            publicIp = null;
        }

        const vpcId = (await awsGet(`/latest/meta-data/network/interfaces/macs/${mac}/vpc-id`, token)).trim();

        networkInterfaces.push({
            private_ip: privateIp,
            public_ip: publicIp,
            network: vpcId,
        });
    }

    return {
        cloud_platform: "aws",
        instance_id: instanceId,
        region,
        machine_type: machineType,
        network_interfaces: networkInterfaces,
    };
}

async function buildGcpMetadataResponse() {
    const instanceId = (await gcpGet("/computeMetadata/v1/instance/id")).trim();

    const zoneFull = (await gcpGet("/computeMetadata/v1/instance/zone")).trim();
    const zone = lastPathSegment(zoneFull); // projects/.../zones/us-east1-b -> us-east1-b
    const region = zone; // assignment expects zone string in region field

    const mtFull = (await gcpGet("/computeMetadata/v1/instance/machine-type")).trim();
    const machineType = lastPathSegment(mtFull); // projects/.../machineTypes/e2-medium -> e2-medium

    const nicsRaw = await gcpGet("/computeMetadata/v1/instance/network-interfaces/");
    const nicIndexes = parseLines(nicsRaw).map((x) => x.replace(/\/$/, ""));

    const networkInterfaces = [];
    for (const idx of nicIndexes) {
        const privateIp = (await gcpGet(`/computeMetadata/v1/instance/network-interfaces/${idx}/ip`)).trim();

        let publicIp = null;
        try {
            publicIp = (await gcpGet(
                `/computeMetadata/v1/instance/network-interfaces/${idx}/access-configs/0/external-ip`
            )).trim();
        } catch (_) {
            publicIp = null;
        }

        const networkFull = (await gcpGet(`/computeMetadata/v1/instance/network-interfaces/${idx}/network`)).trim();
        const networkName = lastPathSegment(networkFull); // projects/.../networks/default -> default

        networkInterfaces.push({
            private_ip: privateIp,
            public_ip: publicIp,
            network: networkName,
        });
    }

    return {
        cloud_platform: "gcp",
        instance_id: instanceId,
        region,
        machine_type: machineType,
        network_interfaces: networkInterfaces,
    };
}

// ------------------- ROUTE HANDLERS -------------------

// Must return 405 for everything except GET (including HEAD/OPTIONS)
router.all("/v1/metadata", (req, res, next) => {
    if (req.method !== "GET") {
        setNoCache(res);
        return methodNotAllowed(res);
    }
    return next();
});

// GET handler
router.get("/v1/metadata", async (req, res) => {
    // reject query params
    const q = rejectQueryParams(req, res);
    if (q) return;

    // reject body
    const b = rejectBody(req, res);
    if (b) return;

    setNoCache(res);

    try {
        const platform = await detectPlatform();
        if (!platform) {
            return serviceUnavailable(res, "Unsupported platform or metadata service not reachable.");
        }

        const payload =
            platform === "aws" ? await buildAwsMetadataResponse() : await buildGcpMetadataResponse();

        return res.status(200).type("application/json").json(payload);
    } catch (_) {
        return serviceUnavailable(res, "Metadata service unavailable or required fields could not be retrieved.");
    }
});

module.exports = router;
