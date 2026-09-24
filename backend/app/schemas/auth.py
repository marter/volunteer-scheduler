from pydantic import BaseModel, EmailStr


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    organization_name: str
    organization_slug: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    organization_slug: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
