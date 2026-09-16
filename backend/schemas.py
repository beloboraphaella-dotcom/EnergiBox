"""Request bodies for the endpoints that carry credentials.

FastAPI turns a bare `password: str` parameter into a *query* parameter,
which puts the secret in the URL — and therefore in access logs, browser
history, proxies and Referer headers. Declaring a Pydantic model instead
moves it into the request body, where it belongs.

Only credential-bearing endpoints use these models today; the rest of the
API still takes query parameters. That is a style inconsistency, not a
security one.
"""

import re

from pydantic import BaseModel, Field, field_validator

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Matches the 6-character rule the clients and admin_create_user already
# enforce, now applied server-side on every path that sets a password.
# Raising this is a one-line change, but it would also need the clients'
# validation messages updated.
MIN_PASSWORD_LENGTH = 6
# Not a security limit — just a bound so an absurd payload can't be used
# to burn CPU in the hashing routine.
MAX_PASSWORD_LENGTH = 256

NewPassword = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
# Existing passwords are only ever compared, never set, so they are not
# held to the current policy — a user whose password predates the rule
# must still be able to log in and change it.
ExistingPassword = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)
Name = Field(min_length=1, max_length=120)


class _EmailModel(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        value = value.strip()
        if not EMAIL_REGEX.match(value):
            raise ValueError("Enter a valid email address")
        return value


class RegisterRequest(_EmailModel):
    name: str = Name
    password: str = NewPassword


class LoginRequest(_EmailModel):
    password: str = ExistingPassword


class UpdateProfileRequest(BaseModel):
    name: str = Name


class ChangePasswordRequest(BaseModel):
    current_password: str = ExistingPassword
    new_password: str = NewPassword


class AdminCreateUserRequest(_EmailModel):
    name: str = Name
    password: str = NewPassword


class AdminResetPasswordRequest(BaseModel):
    new_password: str = NewPassword
