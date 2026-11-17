"""Agent prompts as skills agno/skills/<agent_id>/SKILL.md (openspec/specs/api/agents, «Соавтор»: «Промпт из навыка»,
«Нет навыка», «Неверный заголовок навыка»). No database and no model: temporary skills live in tmp_path."""

import ast
from pathlib import Path

import pytest

from agents import prompts
from agents.prompts import agent_prompt, agent_skill

AGNO = Path(__file__).resolve().parents[1]
REPO_SKILLS = AGNO / "skills"
BODY = "Ты — проверочный агент.\n"


def _skill(directory: Path, agent_id: str, text: str) -> Path:
    path = directory / agent_id / "SKILL.md"
    path.parent.mkdir(parents=True)
    path.write_text(text, encoding="utf-8")
    return path


@pytest.fixture
def skills_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(prompts, "SKILLS_DIR", tmp_path)
    return tmp_path


def test_coauthor_skill_loads() -> None:
    skill = agent_skill("coauthor")
    assert skill.name == "coauthor"
    assert skill.description.strip()
    text = (REPO_SKILLS / "coauthor" / "SKILL.md").read_text(encoding="utf-8")
    body = text.split("---", 2)[2]
    assert skill.instructions.strip() == body.strip()
    assert agent_prompt("coauthor") == skill.instructions


def test_coauthor_agent_takes_its_prompt_from_the_skill() -> None:
    """agents/coauthor.py passes agent_prompt(COAUTHOR_ID) to the Agent; checked without importing it, which would
    need the startup settings of billing and Yandex."""
    module = ast.parse((AGNO / "agents" / "coauthor.py").read_text(encoding="utf-8"))
    ids = [
        node.value.value
        for node in module.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "COAUTHOR_ID" for target in node.targets)
        and isinstance(node.value, ast.Constant)
    ]
    assert ids == ["coauthor"]
    agents = [
        node
        for node in ast.walk(module)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "Agent"
    ]
    (agent,) = agents
    instructions = {keyword.arg: ast.unparse(keyword.value) for keyword in agent.keywords}["instructions"]
    assert instructions == "agent_prompt(COAUTHOR_ID)"


def test_missing_skill_names_the_path(skills_dir: Path) -> None:
    with pytest.raises(RuntimeError, match="not found") as refused:
        agent_skill("coauthor")
    assert str(skills_dir / "coauthor" / "SKILL.md") in str(refused.value)


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        pytest.param(f"---\nname: coauthor\n---\n{BODY}", "description", id="no-description"),
        pytest.param(f"---\nname: coauthor\ndescription: ''\n---\n{BODY}", "description", id="empty-description"),
        pytest.param(f"---\nname: other\ndescription: Агент\n---\n{BODY}", "other", id="foreign-name"),
        pytest.param(f"---\nname: [coauthor\ndescription: Агент\n---\n{BODY}", "YAML", id="broken-yaml"),
        pytest.param(BODY, "frontmatter", id="no-frontmatter"),
        pytest.param("---\nname: coauthor\ndescription: Агент\n---\n", "body", id="empty-body"),
    ],
)
def test_invalid_skill_names_the_file_and_the_reason(skills_dir: Path, text: str, reason: str) -> None:
    path = _skill(skills_dir, "coauthor", text)
    with pytest.raises(RuntimeError) as refused:
        agent_skill("coauthor")
    message = str(refused.value)
    assert str(path) in message
    assert reason in message


def test_valid_temporary_skill_loads(skills_dir: Path) -> None:
    _skill(skills_dir, "coauthor", f"---\nname: coauthor\ndescription: Агент\n---\n{BODY}")
    assert agent_prompt("coauthor").strip() == BODY.strip()


def _repo_skills() -> list[str]:
    found = sorted(path.parent.name for path in REPO_SKILLS.glob("*/SKILL.md"))
    if not found:
        raise RuntimeError(f"No skills found in {REPO_SKILLS}")
    return found


@pytest.mark.parametrize("agent_id", _repo_skills())
def test_every_skill_of_the_repository_loads(agent_id: str) -> None:
    skill = agent_skill(agent_id)
    assert skill.name == agent_id
    assert skill.instructions.strip()
