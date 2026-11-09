import asyncio
import copy
from pathlib import Path
from uuid import uuid4

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from aiohttp import CookieJar
from server.clinic_records import register_clinic


def test_station_auth_reporting_restore_and_interrupted_sessions(tmp_path):
    async def scenario():
        def server():
            app = web.Application()
            register_clinic(app, tmp_path)
            return TestClient(TestServer(app), cookie_jar=CookieJar(unsafe=True))

        async with server() as client:
            assert (await client.get("/api/staff/participants")).status == 401
            assert (
                await client.post("/api/staff/setup", json={"password": "test-station-phrase"})
            ).status == 200
            result = await client.post(
                "/api/staff/participants",
                json={"name": "Test participant", "consent": True, "side": "left"},
            )
            pid = (await result.json())[0]["id"]
            r = {
                "id": str(uuid4()),
                "started": "2026-11-09T12:00:00Z",
                "game": "stars",
                "sources": ["button"],
                "elapsed": 9,
                "actions": 1,
                "rewards": 1,
                "events": [{"seconds": 5, "kind": "reward", "source": "button"}],
            }
            body = {"record": r, "participant": pid, "status": "playing"}
            assert (await client.put("/api/staff/sessions", json=body)).status == 200
            old = copy.deepcopy(body)
            old["record"]["elapsed"] = 3
            assert (await client.put("/api/staff/sessions", json=old)).status == 400
            for fmt in ("csv", "pdf"):
                result = await client.get(f"/api/staff/reports/{r['id']}.{fmt}")
                data = await result.read()
                assert result.status == 200 and (
                    b"%PDF" in data if fmt == "pdf" else b"Actions,1" in data
                )
            backup = await (await client.get("/api/staff/backup")).json()
            assert (await client.post("/api/staff/backup", json=backup)).status == 400
            assert (await client.delete("/api/staff/participants/" + pid)).status == 200
            assert (await client.post("/api/staff/backup", json=backup)).status == 200
        async with server() as client:
            assert (await client.get("/api/staff/participants")).status == 401
            assert (
                await client.post("/api/staff/login", json={"password": "test-station-phrase"})
            ).status == 200
            visits = await (await client.get("/api/staff/participants/" + pid)).json()
            assert visits[0]["status"] == "interrupted"
            assert visits[0]["record"]["elapsed"] == 9
            assert (await client.post("/api/staff/logout")).status == 200
            assert (await client.get(f"/api/staff/reports/{r['id']}.pdf")).status == 401

    asyncio.run(scenario())


def test_feedback_roundtrips_in_backup_and_report(tmp_path):
    async def scenario():
        app = web.Application()
        register_clinic(app, tmp_path)
        async with TestClient(TestServer(app), cookie_jar=CookieJar(unsafe=True)) as client:
            await client.post("/api/staff/setup", json={"password": "disposable-notes-password"})
            people = await (
                await client.post(
                    "/api/staff/participants",
                    json={"name": "Pilot", "side": "left", "consent": True},
                )
            ).json()
            r = {
                "id": str(uuid4()),
                "started": "2026-11-09T12:00:00Z",
                "game": "garden",
                "sources": ["button"],
                "elapsed": 0,
                "rewards": 0,
                "actions": 0,
                "events": [],
            }
            await client.put(
                "/api/staff/sessions",
                json={"participant": people[0]["id"], "record": r, "status": "complete"},
            )
            await client.put(
                f"/api/staff/sessions/{r['id']}/feedback", json={"note": "Wanted a larger button."}
            )
            csv = await (await client.get(f"/api/staff/reports/{r['id']}.csv")).text()
            assert "Wanted a larger button." in csv
            backup = await (await client.get("/api/staff/backup")).json()
            assert backup["sessions"][0]["note"] == "Wanted a larger button."

    asyncio.run(scenario())
