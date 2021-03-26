import PropTypes from "prop-types";
import React, { Component } from "react";
import theme from "../../styles/theme";
import { Card, CardHeader, CardText } from "material-ui/Card";
// import { List, ListItem } from "material-ui/List";
import MenuItem from "material-ui/MenuItem";
import SelectField from "material-ui/SelectField";

import Divider from "@material-ui/core/Divider";
import ClearIcon from "@material-ui/icons/Clear";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ArrowRightIcon from "@material-ui/icons/ArrowRight";

// import Card from '@material-ui/core/Card';
// import CardHeader from '@material-ui/core/CardHeader';
// import CardMedia from '@material-ui/core/CardMedia';
// import CardContent from '@material-ui/core/CardContent';
// import CardActions from '@material-ui/core/CardActions';

const styles = {
  root: {},
  card: {
    marginBottom: 10,
    backgroundColor: theme.components.popup.backgroundColor,
    padding: 10
  },
  cardHeader: {
    padding: 0
  },
  cardText: {
    padding: 0
  },
  pastQuestionsLink: {
    marginTop: "5px",
    borderTop: `1px solid ${theme.components.popup.outline}`,
    borderBottom: `1px solid ${theme.components.popup.outline}`
  }
};

class AssignmentTexterSurveys extends Component {
  constructor(props) {
    super(props);

    this.state = {
      showAllQuestions: false
    };
  }

  getNextScript({ interactionStep, answerIndex }) {
    // filteredAnswerOptions is only on the current script, but we might be choosing a previous script
    const answerOption = (interactionStep.question.filteredAnswerOptions ||
      interactionStep.question.answerOptions)[answerIndex];
    const { nextInteractionStep } = answerOption;
    return nextInteractionStep ? nextInteractionStep.script : null;
  }

  handleExpandChange = newExpandedState => {
    this.setState({ showAllQuestions: newExpandedState });
  };

  handlePrevious = () => {
    const { stepIndex } = this.state;
    this.setState({
      stepIndex: stepIndex - 1
    });
  };

  handleNext = () => {
    const { stepIndex } = this.state;
    this.setState({
      stepIndex: stepIndex + 1
    });
  };

  handleSelectChange = async (interactionStep, answerIndex, value) => {
    const { onQuestionResponseChange } = this.props;
    let questionResponseValue = null;
    let nextScript = null;

    if (value !== "clearResponse") {
      questionResponseValue = value;
      nextScript = this.getNextScript({ interactionStep, answerIndex });
    }

    onQuestionResponseChange({
      interactionStep,
      questionResponseValue,
      nextScript
    });
  };

  renderAnswers(step, currentStep) {
    const menuItems = step.question.answerOptions.map(answerOption => (
      <MenuItem
        key={`${currentStep}_${step.id}_${
          answerOption.nextInteractionStep
            ? answerOption.nextInteractionStep.id
            : answerOption.value
        }`}
        value={answerOption.value}
        primaryText={answerOption.value}
      />
    ));

    menuItems.push(<Divider key={`div${currentStep}_${step.id}`} />);
    menuItems.push(
      <MenuItem
        key="clear${currentStep}"
        value="clearResponse"
        primaryText="Clear response"
      />
    );

    return menuItems;
  }

  renderStep(step, currentStep) {
    const { questionResponses, currentInteractionStep } = this.props;
    const isCurrentStep = step.id === currentInteractionStep.id;
    const responseValue = questionResponses[step.id];
    const { question } = step;

    return question.text ? (
      <div key={`topdiv${currentStep || 0}_${step.id}`}>
        <SelectField
          style={
            isCurrentStep ? styles.currentStepSelect : styles.previousStepSelect
          }
          onChange={(event, index, value) =>
            this.handleSelectChange(step, index, value)
          }
          key={`select${currentStep || 0}_${step.id}`}
          name={question.id}
          fullWidth
          value={responseValue}
          floatingLabelText={question.text}
          hintText="Choose answer"
        >
          {this.renderAnswers(step, currentStep || 0)}
        </SelectField>
      </div>
    ) : (
      ""
    );
  }

  renderCurrentStep(step, oldStyle) {
    const { onRequestClose, questionResponses, listHeader } = this.props;
    if (oldStyle) {
      return this.renderStep(step, 1);
    }
    const responseValue = questionResponses[step.id];
    return (
      <List key="curlist">
        <h3 style={{ padding: 0, margin: 0 }}>
          {listHeader}
          <div style={{ fontWeight: "normal", fontSize: "70%" }}>
            What was their response to:
          </div>
          {step.question.text}
        </h3>
        {Object.keys(questionResponses).length ? (
          <ListItem
            onClick={() => {
              this.handleExpandChange(true);
            }}
            key={`pastquestions`}
            style={styles.pastQuestionsLink}
          >
            <ListItemText primary="All Questions" />
            <ListItemIcon>
              <ArrowRightIcon />
            </ListItemIcon>
          </ListItem>
        ) : null}
        {(
          step.question.filteredAnswerOptions || step.question.answerOptions
        ).map((answerOption, index) => (
          <ListItem
            value={answerOption.value}
            onClick={() => {
              this.handleSelectChange(
                step,
                index,
                responseValue === answerOption.value
                  ? "clearResponse"
                  : answerOption.value
              );
              this.props.onRequestClose();
            }}
            onKeyPress={evt => {
              if (evt.key === "Enter") {
                this.handleSelectChange(
                  step,
                  index,
                  responseValue === answerOption.value
                    ? "clearResponse"
                    : answerOption.value
                );
                this.props.onRequestClose();
              }
            }}
            key={`cur${index}_${answerOption.value}`}
          >
            <ListItemText
              primary={answerOption.value}
              secondary={
                answerOption.nextInteractionStep &&
                answerOption.nextInteractionStep.script
                  ? answerOption.nextInteractionStep.script
                  : null
              }
            />
            {responseValue === answerOption.value && (
              <ListItemIcon>
                <ClearIcon />
              </ListItemIcon>
            )}
          </ListItem>
        ))}
        {responseValue ? null : null}
      </List>
    );
  }

  render() {
    console.log("RENDER SURVEY");
    const { interactionSteps, currentInteractionStep } = this.props;
    const oldStyle = typeof this.props.onRequestClose != "function";

    let { showAllQuestions } = this.state;
    showAllQuestions = true;
    return interactionSteps.length === 0 ? null : (
      <Card style={styles.card} onExpandChange={this.handleExpandChange}>
        {oldStyle || showAllQuestions ? (
          <CardHeader
            style={styles.cardHeader}
            title={showAllQuestions ? "All questions" : "Current question"}
            showExpandableButton={oldStyle && interactionSteps.length > 1}
          />
        ) : null}
        <CardText style={styles.cardText} key={"curcard"}>
          {showAllQuestions
            ? null
            : this.renderCurrentStep(currentInteractionStep, oldStyle)}
        </CardText>
        {showAllQuestions ? (
          <CardText style={styles.cardText} key={"curtext"}>
            {interactionSteps.map(step => this.renderStep(step, 0))}
          </CardText>
        ) : null}
      </Card>
    );
  }
}

AssignmentTexterSurveys.propTypes = {
  contact: PropTypes.object,
  interactionSteps: PropTypes.array,
  currentInteractionStep: PropTypes.object,
  questionResponses: PropTypes.object,
  listHeader: PropTypes.object,
  onQuestionResponseChange: PropTypes.func,
  onRequestClose: PropTypes.func
};

export default AssignmentTexterSurveys;
