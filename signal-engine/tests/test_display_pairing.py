import asyncio
from aiohttp import CookieJar, web
from aiohttp.test_utils import TestClient,TestServer
from server.clinic_records import register_clinic


def test_invitation_one_device_and_scoped_controls(tmp_path):
    async def scenario():
        app=web.Application()
        register_clinic(app,tmp_path)
        async with TestClient(TestServer(app),cookie_jar=CookieJar(unsafe=True)) as client:
            await client.post("/api/staff/setup",json={"password":"disposable-station-pass"})
            people=await (await client.post("/api/staff/participants",json={"name":"Private label","side":"left","consent":True})).json()
            invite=await (await client.post("/api/staff/display",json={"participant":people[0]["id"],"game":"garden"})).json()
            code=invite["url"].split("#display=")[1]
            claim=await (await client.post("/api/display/claim",json={"code":code})).json()
            assert (await client.post("/api/display/claim",json={"code":code})).status==403
            assert (await client.post("/api/display/sync",json={})).status==403
            headers={"Authorization":"Bearer "+claim["token"]}
            waiting=await (await client.post("/api/display/sync",headers=headers,json={})).json()
            assert waiting["state"]=="waiting" and "Private label" not in str(waiting)
            async def control(command):
                return await (await client.post("/api/staff/display/control",json={"command":command,"session":invite["session"]})).json()
            for command, state in [("start","playing"),("pause","paused"),("resume","playing")]:
                assert (await control(command))["state"]==state
            r={"id":invite["session"],"game":"garden","started":"2026-11-09T12:00:00Z","sources":["button"],"elapsed":4,"actions":1,
               "events":[{"seconds":1,"kind":"action","source":"button"}],"rewards":0}
            await client.post("/api/display/sync",headers=headers,json={"record":r})
            assert (await control("end"))["state"]=="ending"
            final=await (await client.post("/api/display/sync",headers=headers,json={"record":r,"finished":True})).json()
            assert final["state"]=="complete"
            visits=await (await client.get("/api/staff/participants/"+people[0]["id"])).json()
            assert visits[0]["status"]=="complete" and visits[0]["record"]["actions"]==1
    asyncio.run(scenario())
