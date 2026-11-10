import asyncio
from aiohttp import CookieJar, web
from aiohttp.test_utils import TestClient, TestServer
from server.clinic_records import register_clinic


def test_invitation_one_device_and_scoped_controls(tmp_path):
    async def scenario():
        app = web.Application()
        register_clinic(app, tmp_path)
        async with TestClient(TestServer(app), cookie_jar=CookieJar(unsafe=True)) as client:
            await client.post("/api/staff/setup", json={"password": "disposable-station-pass"})
            people = await (
                await client.post(
                    "/api/staff/participants",
                    json={"name": "Private label", "side": "left", "consent": True},
                )
            ).json()
            invite = await (
                await client.post(
                    "/api/staff/display", json={"participant": people[0]["id"], "game": "garden"}
                )
            ).json()
            code = invite["url"].split("#display=")[1]
            claim = await (await client.post("/api/display/claim", json={"code": code})).json()
            assert (await client.post("/api/display/claim", json={"code": code})).status == 403
            assert (await client.post("/api/display/sync", json={})).status == 403
            headers = {"Authorization": "Bearer " + claim["token"]}
            waiting = await (
                await client.post("/api/display/sync", headers=headers, json={})
            ).json()
            assert waiting["state"] == "waiting" and "Private label" not in str(waiting)

            async def control(command):
                return await (
                    await client.post(
                        "/api/staff/display/control",
                        json={"command": command, "session": invite["session"]},
                    )
                ).json()

            for command, state in [
                ("start", "playing"),
                ("pause", "paused"),
                ("resume", "playing"),
            ]:
                assert (await control(command))["state"] == state
            r = {
                "id": invite["session"],
                "game": "garden",
                "started": "2026-11-09T12:00:00Z",
                "sources": ["button"],
                "elapsed": 4,
                "actions": 1,
                "events": [{"seconds": 1, "kind": "action", "source": "button"}],
                "rewards": 0,
            }
            await client.post("/api/display/sync", headers=headers, json={"record": r})
            assert (await control("end"))["state"] == "ending"
            assert (await control("end"))["state"] == "ending"
            stale = dict(r, elapsed=2, actions=0, events=[])
            final = await (
                await client.post(
                    "/api/display/sync", headers=headers, json={"record": stale, "finished": True}
                )
            ).json()
            assert final["state"] == "complete"
            visits = await (await client.get("/api/staff/participants/" + people[0]["id"])).json()
            assert visits[0]["status"] == "complete" and visits[0]["record"]["actions"] == 1

    asyncio.run(scenario())


def test_cancelling_claimed_invitation_never_starts_a_patient_record(tmp_path):
    async def scenario():
        app = web.Application()
        register_clinic(app, tmp_path)
        async with TestClient(TestServer(app), cookie_jar=CookieJar(unsafe=True)) as client:
            await client.post("/api/staff/setup", json={"password": "disposable-station-pass"})
            people = await (await client.post("/api/staff/participants", json={
                "name": "Test", "side": "left", "consent": True
            })).json()
            pid = people[0]["id"]
            invite = await (await client.post("/api/staff/display", json={"participant": pid, "game": "stars"})).json()
            code = invite["url"].split("#display=")[1]
            claim = await (await client.post("/api/display/claim", json={"code": code})).json()
            headers = {"Authorization": "Bearer " + claim["token"]}
            ended = await (await client.post("/api/staff/display/control", json={"session": invite["session"], "command": "end"})).json()
            assert ended["state"] == "complete"
            snapshot = await (await client.post("/api/display/sync", headers=headers, json={})).json()
            assert snapshot["state"] == "complete" and snapshot["record"] is None
            assert await (await client.get("/api/staff/participants/" + pid)).json() == []

    asyncio.run(scenario())


def test_local_launch_and_recovery_keep_one_owner_and_one_visit(tmp_path, monkeypatch):
    from server import display_pairing
    from types import SimpleNamespace

    clock = [100.0]
    monkeypatch.setattr(display_pairing, "time", SimpleNamespace(monotonic=lambda: clock[0]))

    async def scenario():
        app = web.Application()
        register_clinic(app, tmp_path)
        async with TestClient(TestServer(app), cookie_jar=CookieJar(unsafe=True)) as client:
            await client.post("/api/staff/setup", json={"password": "disposable-station-pass"})
            people = await (await client.post("/api/staff/participants", json={
                "name": "Local owner", "side": "right", "consent": True
            })).json()
            pid = people[0]["id"]
            settings = {"participant": pid, "game": "fruit", "target": "workstation"}
            run = await (await client.post("/api/staff/display", json=settings)).json()
            sid = run["display"]["session"]
            assert run["display"]["state"] == "playing"
            assert (await client.post("/api/staff/display", json=settings)).status == 409
            recover = {"session": sid}
            assert (await client.post("/api/staff/display/recover", json=recover)).status == 409
            clock[0] += 6
            new = await (await client.post("/api/staff/display/recover", json=recover)).json()
            assert new["token"] != run["token"]
            async def sync(token):
                return await client.post("/api/display/sync", json={}, headers={"Authorization": "Bearer "+token})
            assert (await sync(run["token"])).status == 403
            snapshot = await (await sync(new["token"])).json()
            assert snapshot["state"] == "paused" and pid not in str(snapshot)
            assert (await client.post("/api/staff/display/control", json={**recover,"command":"start"})).status == 409
            assert (await client.post("/api/staff/display/control", json={**recover,"command":"resume"})).status == 200
            clock[0] += 6
            ended = await (await client.post("/api/staff/display/control", json={**recover,"command":"end"})).json()
            assert ended["outcome"] == "interrupted"
            visits = await (await client.get("/api/staff/participants/"+pid)).json()
            assert len(visits) == 1 and visits[0]["id"] == sid and visits[0]["status"] == "interrupted"
    asyncio.run(scenario())
