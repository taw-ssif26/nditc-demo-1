from argon2 import PasswordHasher

import os
# Defaults are the strong RFC 9106 profile. Tiny free hosts can set ARGON_MEM_KB=19456 ARGON_TIME=2 ARGON_PAR=1 (the OWASP minimum) to keep logins fast.
ph = PasswordHasher(time_cost=int(os.environ.get("ARGON_TIME", "3")), memory_cost=int(os.environ.get("ARGON_MEM_KB", "65536")), parallelism=int(os.environ.get("ARGON_PAR", "4")))
DUMMY = ph.hash("dummy-password-for-timing")  # verified when the email is unknown, so timing doesn't leak accounts


def verify(h: str, p: str) -> bool:
    try:
        return ph.verify(h, p)
    except Exception:
        return False
