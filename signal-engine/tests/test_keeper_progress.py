import json
import sqlite3

from server.display_pairing import keeper_work


def test_keeper_progress_counts_completed_work_for_only_the_selected_participant():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE sessions(participant TEXT,status TEXT,record TEXT)")
    for participant, status, game, work in [
        ("a", "complete", "river", 20),
        ("a", "complete", "keeper", 5),
        ("a", "complete", "fruit", 2),
        ("a", "playing", "keeper", 9),
        ("b", "complete", "keeper", 10),
    ]:
        db.execute(
            "INSERT INTO sessions VALUES(?,?,?)",
            (
                participant,
                status,
                json.dumps({"game": game, "rewards": work, "harborBase": 40}),
            ),
        )
    assert keeper_work(db, "a") == 10
    assert keeper_work(db, "b") == 10
    assert keeper_work(db, "c") == 0
    db.close()


def test_keeper_balance_is_authoritative_for_station_and_paired_display(tmp_path):
    import asyncio
    from uuid import uuid4
    from aiohttp import CookieJar, web
    from aiohttp.test_utils import TestClient, TestServer
    from server.clinic_records import register_clinic

    async def scenario():
        app = web.Application()
        register_clinic(app, tmp_path)
        async with TestClient(
            TestServer(app), cookie_jar=CookieJar(unsafe=True)
        ) as client:
            await client.post(
                "/api/staff/setup", json={"password": "keeper-test-station"}
            )
            people = await (
                await client.post(
                    "/api/staff/participants",
                    json={"name": "Test keeper", "side": "left", "consent": True},
                )
            ).json()
            pid = people[0]["id"]
            for game, rewards in [("river", 5), ("fruit", 2), ("keeper", 4)]:
                record = {
                    "id": str(uuid4()),
                    "started": "2026-11-09T12:00:00Z",
                    "game": game,
                    "sources": ["button"],
                    "elapsed": 6,
                    "actions": rewards,
                    "rewards": rewards,
                    "events": [
                        {"kind": kind, "seconds": i + 1, "source": "button"}
                        for i in range(rewards)
                        for kind in ("action", "reward")
                    ],
                    "harborBase": 9999,
                }
                response = await client.put(
                    "/api/staff/sessions",
                    json={"participant": pid, "record": record, "status": "complete"},
                )
                assert response.status == 200, await response.text()
                if game == "keeper":
                    assert (await response.json())["harborBase"] == 5
                csv = await client.get(f"/api/staff/reports/{record['id']}.csv")
                assert csv.status == 200
            invite = await (
                await client.post(
                    "/api/staff/display", json={"participant": pid, "game": "keeper"}
                )
            ).json()
            claim = await (
                await client.post(
                    "/api/display/claim",
                    json={"code": invite["url"].split("#display=")[1]},
                )
            ).json()
            snapshot = await (
                await client.post(
                    "/api/display/sync",
                    json={},
                    headers={"Authorization": "Bearer " + claim["token"]},
                )
            ).json()
            assert snapshot["harborBase"] == 9
            assert snapshot["game"] == "keeper" and pid not in str(snapshot)

    asyncio.run(scenario())
