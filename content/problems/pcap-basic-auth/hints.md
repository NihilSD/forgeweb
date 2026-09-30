## 1. Nudge

Open the capture in Wireshark and filter on `http`. How does the browser send the username and password with HTTP Basic authentication?

## 2. Approach

Each request with an `Authorization: Basic ...` header carries `username:password` in Base64. Several attempts were rejected with `401 Unauthorized`. Match each request to its response (Wireshark's _Follow → TCP Stream_ does this) and decode the header of the one answered with `200 OK`.

## 3. Pseudocode

```
for each TCP connection:
    request  = bytes sent to port 80
    response = bytes sent from port 80
    if response starts with "HTTP/1.1 200" and request has "Authorization: Basic X":
        print base64decode(X) after the first ":"
```

## 4. Solution

In Wireshark: filter `http.response.code == 200`, right-click the `/admin/` response, _Follow → TCP Stream_, copy the `Authorization` value and decode it (Wireshark also shows the decoded _Credentials_ in the packet details).

Without Wireshark, `tshark -r capture.pcap -Y 'http.authorization' -T fields -e tcp.stream -e http.authorization` lists every attempt, and `-Y 'http.response.code == 200' -T fields -e tcp.stream` shows which stream succeeded.
