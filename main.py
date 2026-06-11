import os
import json
import ast
import requests
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langchain.tools import tool

# Load environment variables from .env if it exists
load_dotenv()

app = FastAPI(title="SkillMap Agent API")

# Auto-detect GEMINI_API_KEY from sibling projects if not set in local .env
def detect_sibling_gemini_key():
    siblings = [
        "../AI-Powered Doubt Solver/server/.env",
        "../AI-Powered Mock Interview/server/.env",
        "../Smart Code Translator/server/.env"
    ]
    for rel_path in siblings:
        abs_path = os.path.abspath(os.path.join(os.getcwd(), rel_path))
        if os.path.exists(abs_path):
            try:
                with open(abs_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("GEMINI_API_KEY="):
                            val = line.strip().split("GEMINI_API_KEY=")[1]
                            val = val.strip("'\"")
                            if val and not val.startswith("your_"):
                                return val
            except Exception:
                pass
    return None

# Check environment state
def get_api_keys():
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not gemini_key:
        sibling_key = detect_sibling_gemini_key()
        if sibling_key:
            # Set it temporarily in current env
            os.environ["GEMINI_API_KEY"] = sibling_key
            gemini_key = sibling_key

    return {
        "gemini": bool(gemini_key),
        "tavily": bool(os.environ.get("TAVILY_API_KEY")),
        "rapidapi": bool(os.environ.get("RAPIDAPI_KEY")),
        "gemini_key_detected": bool(detect_sibling_gemini_key()) and not os.environ.get("GEMINI_API_KEY")
    }

class SaveKeysRequest(BaseModel):
    gemini_key: str = ""
    tavily_key: str = ""
    rapidapi_key: str = ""

class AnalyzeSkillRequest(BaseModel):
    skill: str
    location: str

# Endpoints
@app.get("/api/get-keys")
def handle_get_keys():
    return get_api_keys()

@app.post("/api/save-keys")
def handle_save_keys(req: SaveKeysRequest):
    env_content = ""
    # Load existing env if any
    existing_vars = {}
    if os.path.exists(".env"):
        try:
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    if "=" in line:
                        k, v = line.strip().split("=", 1)
                        existing_vars[k.strip()] = v.strip()
        except Exception:
            pass

    # Update with new values if provided
    if req.gemini_key:
        existing_vars["GEMINI_API_KEY"] = req.gemini_key
        existing_vars["GOOGLE_API_KEY"] = req.gemini_key
    if req.tavily_key:
        existing_vars["TAVILY_API_KEY"] = req.tavily_key
    if req.rapidapi_key:
        existing_vars["RAPIDAPI_KEY"] = req.rapidapi_key

    # Save back to .env
    try:
        with open(".env", "w", encoding="utf-8") as f:
            for k, v in existing_vars.items():
                f.write(f"{k}={v}\n")
        
        # Override environment in current process
        load_dotenv(override=True)
        return {"status": "success", "message": "Keys saved and environment loaded successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write to .env: {str(e)}")

# Custom JSearch tool using RapidAPI
@tool
def search_jobs(skill: str, location: str) -> list:
    """Search for jobs requiring a specific skill using JSearch API from RapidAPI.
    Returns a list of matching job listings.
    """
    print(f"\n[search_jobs tool] Searching for '{skill}' in '{location}'")
    rapidapi_key = os.environ.get("RAPIDAPI_KEY")
    if not rapidapi_key:
        print("[search_jobs tool] Error: RAPIDAPI_KEY is not set.")
        return [{"error": "RAPIDAPI_KEY is not configured in settings."}]

    url = "https://jsearch.p.rapidapi.com/search"
    headers = {
        "x-rapidapi-key": rapidapi_key,
        "x-rapidapi-host": "jsearch.p.rapidapi.com"
    }
    querystring = {
        "query": f"{skill} in {location}",
        "page": "1",
        "num_pages": "1"
    }

    try:
        response = requests.get(url, headers=headers, params=querystring, timeout=12)
        response.raise_for_status()
        data = response.json().get("data", [])
        
        jobs = []
        for item in data[:8]:  # Limit to 8 items to fit token context nicely
            jobs.append({
                "job_title": item.get("job_title"),
                "employer_name": item.get("employer_name"),
                "job_location": f"{item.get('job_city', '')}, {item.get('job_state', '')}, {item.get('job_country', '')}".strip(", "),
                "job_apply_link": item.get("job_apply_link"),
                "job_description": item.get("job_description")[:300] + "..." if item.get("job_description") else "",
                "job_employment_type": item.get("job_employment_type"),
                "job_publisher": item.get("job_publisher"),
                "job_min_salary": item.get("job_min_salary"),
                "job_max_salary": item.get("job_max_salary"),
                "job_salary_currency": item.get("job_salary_currency"),
                "job_required_experience": item.get("job_required_experience", {}).get("required_experience_in_months")
            })
        print(f"[search_jobs tool] Found {len(jobs)} jobs.")
        return jobs
    except Exception as e:
        print(f"[search_jobs tool] Error: {e}")
        return [{"error": f"Failed to fetch jobs: {str(e)}"}]

@app.post("/api/analyze-skill")
def handle_analyze_skill(req: AnalyzeSkillRequest):
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not gemini_key:
        sibling_key = detect_sibling_gemini_key()
        if sibling_key:
            gemini_key = sibling_key
            os.environ["GEMINI_API_KEY"] = sibling_key
            os.environ["GOOGLE_API_KEY"] = sibling_key
        else:
            raise HTTPException(status_code=400, detail="Gemini API Key is not configured.")

    tavily_key = os.environ.get("TAVILY_API_KEY")
    if not tavily_key:
        raise HTTPException(status_code=400, detail="Tavily API Key is not configured.")

    try:
        # Initialize Tavily search tool
        skill_demand_tool = TavilySearch(
            max_results=5,
            search_depth="advanced",
            tavily_api_key=tavily_key
        )

        # Create Agent
        system_prompt = """You are a Skill-to-Career Mapping assistant that helps students understand skill demand and find matching job opportunities.
You have access to these tools:
- skill_demand_tool: Search for industry demand, salary insights, and career trends
- search_jobs: Find actual job listings requiring specific skills

Help the student by researching the skill they ask about and finding relevant opportunities.
Present results in a clean, readable format with clear sections and proper spacing. Include all job details with apply links. Don't use markdown format."""

        user_query = f"What's the demand for {req.skill} in the industry and show me related job openings in {req.location}"
        
        response = None
        try:
            print("[API] Running agent using Gemini 2.5 Flash...")
            model = init_chat_model(
                "google_genai:gemini-2.5-flash",
                api_key=gemini_key
            )
            agent = create_agent(
                model=model,
                tools=[skill_demand_tool, search_jobs],
                system_prompt=system_prompt
            )
            response = agent.invoke({
                "messages": [{"role": "user", "content": user_query}]
            })
        except Exception as e:
            err_str = str(e).lower()
            if "unavailable" in err_str or "demand" in err_str or "503" in err_str or "rate limit" in err_str or "spike" in err_str or "overloaded" in err_str:
                print("[API] Gemini 2.5 Flash busy/unavailable. Falling back to Gemini 1.5 Flash...")
                model = init_chat_model(
                    "google_genai:gemini-1.5-flash",
                    api_key=gemini_key
                )
                agent = create_agent(
                    model=model,
                    tools=[skill_demand_tool, search_jobs],
                    system_prompt=system_prompt
                )
                response = agent.invoke({
                    "messages": [{"role": "user", "content": user_query}]
                })
            else:
                raise e

        # Extract messages
        messages = response.get("messages", [])
        if not messages:
            raise Exception("Agent returned empty messages history.")

        # Final message content
        agent_final_text = messages[-1].content

        # Extract structured jobs list from search_jobs tool calls
        jobs_list = []
        for msg in messages:
            # Check if this is a tool execution result of search_jobs
            if getattr(msg, "name", None) == "search_jobs" or getattr(msg, "type", None) == "tool" and getattr(msg, "name", None) == "search_jobs":
                try:
                    content = msg.content
                    if isinstance(content, str):
                        try:
                            parsed = json.loads(content)
                        except json.JSONDecodeError:
                            parsed = ast.literal_eval(content)
                        if isinstance(parsed, list):
                            jobs_list = parsed
                    elif isinstance(content, list):
                        jobs_list = content
                except Exception as e:
                    print(f"Error parsing job tool message content: {e}")

        # Check if the jobs list has any error entries
        if jobs_list and len(jobs_list) == 1 and "error" in jobs_list[0]:
            error_msg = jobs_list[0]["error"]
            print(f"Job search tool returned error: {error_msg}")

        return {
            "insights": agent_final_text,
            "jobs": jobs_list
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Serve Frontend static files
# Make sure static directory exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")
